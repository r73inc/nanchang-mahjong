import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminUpdateUserAttributesCommand,
  InitiateAuthCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ChangePasswordCommand,
  NotAuthorizedException,
  UserNotFoundException,
  UsernameExistsException,
  InvalidPasswordException,
  LimitExceededException,
  type AttributeType,
} from '@aws-sdk/client-cognito-identity-provider';
import type { AppConfig } from '../config/configuration';

@Injectable()
export class CognitoService implements OnModuleInit {
  private readonly logger = new Logger(CognitoService.name);
  private client!: CognitoIdentityProviderClient;
  private userPoolId!: string;
  private clientId!: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  onModuleInit() {
    const awsCfg = this.config.get('aws', { infer: true });
    const cognitoCfg = this.config.get('cognito', { infer: true });
    this.userPoolId = cognitoCfg.userPoolId;
    this.clientId = cognitoCfg.clientId;

    this.client = new CognitoIdentityProviderClient({
      region: awsCfg.region,
      ...(awsCfg.endpoints.cognitoIdp && { endpoint: awsCfg.endpoints.cognitoIdp }),
      ...(awsCfg.accessKeyId && {
        credentials: {
          accessKeyId: awsCfg.accessKeyId,
          secretAccessKey: awsCfg.secretAccessKey ?? 'local',
        },
      }),
    });
    this.logger.log(`Cognito ready → pool: ${this.userPoolId}`);
  }

  /** Create a Cognito user and immediately set a permanent password (no force-change). */
  async adminCreateUser(email: string, password: string): Promise<string> {
    try {
      const createRes = await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          MessageAction: 'SUPPRESS', // don't send welcome email — our own email flow handles it
          TemporaryPassword: password,
        }),
      );
      const sub = createRes.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
      if (!sub) throw new Error('Cognito did not return a sub for new user');

      await this.client.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          Password: password,
          Permanent: true,
        }),
      );

      return sub;
    } catch (err) {
      if (err instanceof UsernameExistsException) {
        throw Object.assign(new Error('EMAIL_ALREADY_REGISTERED'), {
          code: 'EMAIL_ALREADY_REGISTERED',
        });
      }
      if (err instanceof InvalidPasswordException) {
        throw Object.assign(new Error('INVALID_PASSWORD'), { code: 'INVALID_PASSWORD' });
      }
      throw err;
    }
  }

  /** Authenticate with email + password using USER_PASSWORD_AUTH flow. Returns the Cognito sub. */
  async initiateAuth(email: string, password: string): Promise<string> {
    try {
      const res = await this.client.send(
        new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: this.clientId,
          AuthParameters: { USERNAME: email, PASSWORD: password },
        }),
      );
      // Decode the Cognito access token to extract the sub
      const accessToken = res.AuthenticationResult?.AccessToken;
      if (!accessToken) throw new Error('No access token returned from Cognito');

      return this.decodeTokenSub(accessToken);
    } catch (err) {
      if (err instanceof NotAuthorizedException || err instanceof UserNotFoundException) {
        throw Object.assign(new Error('INVALID_CREDENTIALS'), { code: 'INVALID_CREDENTIALS' });
      }
      if (err instanceof LimitExceededException) {
        throw Object.assign(new Error('TOO_MANY_ATTEMPTS'), { code: 'TOO_MANY_ATTEMPTS' });
      }
      throw err;
    }
  }

  async forgotPassword(email: string): Promise<void> {
    try {
      await this.client.send(
        new ForgotPasswordCommand({ ClientId: this.clientId, Username: email }),
      );
    } catch (err) {
      // Always succeed on the surface to prevent email enumeration
      if (err instanceof UserNotFoundException) return;
      throw err;
    }
  }

  async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
    await this.client.send(
      new ConfirmForgotPasswordCommand({
        ClientId: this.clientId,
        Username: email,
        ConfirmationCode: code,
        Password: newPassword,
      }),
    );
  }

  async changePassword(
    accessToken: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await this.client.send(
      new ChangePasswordCommand({
        AccessToken: accessToken,
        PreviousPassword: currentPassword,
        ProposedPassword: newPassword,
      }),
    );
  }

  async adminDeleteUser(email: string): Promise<void> {
    await this.client.send(
      new AdminDeleteUserCommand({ UserPoolId: this.userPoolId, Username: email }),
    );
  }

  /** Disable a Cognito user by sub — they cannot exchange credentials for new tokens. */
  async adminDisableUser(sub: string): Promise<void> {
    await this.client.send(
      new AdminDisableUserCommand({ UserPoolId: this.userPoolId, Username: sub }),
    );
  }

  /** Re-enable a previously disabled Cognito user. */
  async adminEnableUser(sub: string): Promise<void> {
    await this.client.send(
      new AdminEnableUserCommand({ UserPoolId: this.userPoolId, Username: sub }),
    );
  }

  /** Update the custom:role attribute on a Cognito user so future tokens carry the new role. */
  async adminSetRole(sub: string, role: 'user' | 'admin'): Promise<void> {
    await this.client.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: this.userPoolId,
        Username: sub,
        UserAttributes: [{ Name: 'custom:role', Value: role }],
      }),
    );
  }

  async adminGetUserAttributes(email: string): Promise<AttributeType[]> {
    const res = await this.client.send(
      new AdminGetUserCommand({ UserPoolId: this.userPoolId, Username: email }),
    );
    return res.UserAttributes ?? [];
  }

  /** Minimal Base64url JWT decode — only for extracting Cognito's sub claim (no verify). */
  private decodeTokenSub(token: string): string {
    const parts = token.split('.');
    if (parts.length < 2) throw new Error('Malformed JWT');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')) as {
      sub?: string;
    };
    if (!payload.sub) throw new Error('No sub claim in Cognito token');
    return payload.sub;
  }
}
