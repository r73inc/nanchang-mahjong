import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MyProfile {
  sub: string;
  handle: string;
  role: 'user' | 'admin';
  createdAt: string;
  updatedAt: string;
  disabled: boolean;
  gamesPlayed: number;
  gamesWon: number;
  rating: number;
  streak: number;
  avatarUrl?: string | null;
}

export interface UpdateProfileInput {
  handle?: string;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useMyProfile() {
  return useQuery({
    queryKey: ['profile', 'me'],
    queryFn: () => api.get<MyProfile>('/users/me').then((r) => r.data),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateProfileInput) =>
      api.patch<MyProfile>('/users/me', data).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile', 'me'] });
    },
  });
}

export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const dataUri = await resizeImageToCanvas(file, 200);
      const contentType = file.type.startsWith('image/png') ? 'image/png' : 'image/jpeg';
      const blob = dataURItoBlob(dataUri, contentType);
      const formData = new FormData();
      formData.append('file', blob, contentType === 'image/png' ? 'avatar.png' : 'avatar.jpg');
      return api
        .put<{ avatarUrl: string }>('/users/me/avatar', formData)
        .then((r) => r.data.avatarUrl);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile', 'me'] });
    },
  });
}

function dataURItoBlob(dataURI: string, contentType: string): Blob {
  const byteString = atob(dataURI.split(',')[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type: contentType });
}

/** Resize an image File to maxSize×maxSize via canvas, returning a data-URI. */
async function resizeImageToCanvas(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = maxSize;
      canvas.height = maxSize;
      const ctx = canvas.getContext('2d')!;
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - side) / 2;
      const sy = (img.naturalHeight - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);
      resolve(
        canvas.toDataURL(file.type.startsWith('image/png') ? 'image/png' : 'image/jpeg', 0.9),
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}
