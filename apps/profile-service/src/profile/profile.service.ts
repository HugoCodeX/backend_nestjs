import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { profiles } from '../db/schema';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  async getProfile(userId: string) {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId));

    // auto-create profile if it doesn't exist yet — happens on first login
    if (!profile) {
      const [created] = await db
        .insert(profiles)
        .values({ userId })
        .returning();
      return created;
    }

    return profile;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId));

    // create profile if it doesn't exist before updating
    if (!profile) {
      const [created] = await db
        .insert(profiles)
        .values({ userId, ...dto })
        .returning();
      return created;
    }

    const [updated] = await db
      .update(profiles)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(profiles.userId, userId))
      .returning();

    return updated;
  }
}
