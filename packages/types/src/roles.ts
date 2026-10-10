export const USER_ROLES = [
  "viewer",
  "creator",
  "moderator",
  "admin",
  "studio_member",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface Profile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  roles: UserRole[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatorProfile {
  id: string;
  profileId: string;
  creatorName: string;
  bio: string | null;
  websiteUrl: string | null;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}
