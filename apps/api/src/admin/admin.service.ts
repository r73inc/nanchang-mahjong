import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DynamoDBService, DK } from '../database/dynamodb.service';
import { InvitesService, type InviteRecord } from '../invites/invites.service';
import { UsersService, type UserProfile } from '../users/users.service';
import { CognitoService } from '../auth/cognito.service';
import type { UserRole } from '../common/interfaces/authenticated-user.interface';

export interface AuditEntry {
  action: string;
  actorSub: string;
  targetSub?: string;
  targetCode?: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly db: DynamoDBService,
    private readonly invites: InvitesService,
    private readonly users: UsersService,
    private readonly cognito: CognitoService,
  ) {}

  // ── Audit log ────────────────────────────────────────────────────────────────

  async writeAudit(entry: AuditEntry): Promise<void> {
    const ts = new Date().toISOString();
    const rand = randomBytes(4).toString('hex');
    await this.db.put({
      Item: {
        ...DK.auditLog(`${ts}#${rand}`),
        ...entry,
        createdAt: ts,
      },
    });
  }

  // ── Invites ──────────────────────────────────────────────────────────────────

  async listInvites(): Promise<InviteRecord[]> {
    return this.invites.listAll();
  }

  async createInvites(
    actorSub: string,
    count: number,
    expiresAt?: string,
    note?: string,
  ): Promise<InviteRecord[]> {
    if (expiresAt && new Date(expiresAt) <= new Date()) {
      throw new BadRequestException('expiresAt must be a future date');
    }
    const results = await Promise.all(
      Array.from({ length: count }, () =>
        this.invites.create({ adminSub: actorSub, expiresAt, note }),
      ),
    );
    await this.writeAudit({
      action: 'CREATE_INVITE',
      actorSub,
      payload: { count, expiresAt, note, codes: results.map((r) => r.code) },
    });
    return results;
  }

  async revokeInvite(actorSub: string, code: string): Promise<void> {
    await this.invites.revoke(code);
    await this.writeAudit({ action: 'REVOKE_INVITE', actorSub, targetCode: code });
  }

  // ── Users ────────────────────────────────────────────────────────────────────

  async listUsers(search?: string): Promise<UserProfile[]> {
    return this.users.listAll(search);
  }

  async setRole(actorSub: string, targetSub: string, role: UserRole): Promise<void> {
    if (actorSub === targetSub) {
      throw new ForbiddenException('Cannot change your own role');
    }
    await this.users.setRole(targetSub, role);
    // Mirror role change to Cognito custom attribute so JWTs issued after
    // this point carry the new role.
    await this.cognito.adminSetRole(targetSub, role);
    await this.writeAudit({ action: 'SET_ROLE', actorSub, targetSub, payload: { role } });
  }

  async setDisabled(actorSub: string, targetSub: string, disabled: boolean): Promise<void> {
    if (actorSub === targetSub) {
      throw new ForbiddenException('Cannot disable your own account');
    }
    await this.users.setDisabled(targetSub, disabled);
    // Mirror enable/disable to Cognito so the user cannot exchange credentials
    // for a new JWT while disabled.
    if (disabled) {
      await this.cognito.adminDisableUser(targetSub);
    } else {
      await this.cognito.adminEnableUser(targetSub);
    }
    await this.writeAudit({
      action: disabled ? 'DISABLE_USER' : 'ENABLE_USER',
      actorSub,
      targetSub,
    });
  }
}
