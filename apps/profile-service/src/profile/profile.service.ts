import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { profiles } from '../db/schema';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  async getProfile(userId: string) {
    // Upsert atómico: si no existe, lo crea. Si ya existe, lo devuelve.
    // Evita race condition entre dos requests concurrentes del mismo user
    // (profiles.user_id es UNIQUE, sin ON CONFLICT el segundo INSERT falla).
    const inserted = await db
      .insert(profiles)
      .values({ userId })
      .onConflictDoNothing({ target: profiles.userId })
      .returning();

    if (inserted.length > 0) return inserted[0];

    const [existing] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId));

    return existing;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const updates: Partial<typeof profiles.$inferInsert> = {};
    if (dto.firstName !== undefined) updates.firstName = dto.firstName;
    if (dto.lastName !== undefined) updates.lastName = dto.lastName;
    if (dto.bio !== undefined) updates.bio = dto.bio;
    if (dto.avatarUrl !== undefined) updates.avatarUrl = dto.avatarUrl;

    if (Object.keys(updates).length === 0) {
      return this.getProfile(userId);
    }

    // Asegura que el perfil exista antes de actualizar.
    await db
      .insert(profiles)
      .values({ userId })
      .onConflictDoNothing({ target: profiles.userId });

    const [updated] = await db
      .update(profiles)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(profiles.userId, userId))
      .returning();

    return updated;
  }
}
