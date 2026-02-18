import { supabase } from '@/lib/supabase/client';
import type { Bulletin, User } from '@/lib/supabase/types';

export interface BulletinWithCreator extends Bulletin {
  creator?: Pick<User, 'id' | 'full_name' | 'email'>;
}

export interface BulletinInput {
  title: string;
  body: string;
  expiresAt?: string | null;
}

export async function listBulletins(): Promise<{
  data: BulletinWithCreator[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase
      .from('bulletins')
      .select('*')
      .is('deleted_at', null)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: error as Error };
    }

    const bulletins = (data ?? []) as Bulletin[];

    if (bulletins.length === 0) {
      return { data: [], error: null };
    }

    const creatorIds = Array.from(new Set(bulletins.map((b) => b.creator_id)));

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, full_name, email')
      .in('id', creatorIds);

    if (usersError) {
      // Still return bulletins without creator details
      return { data: bulletins as BulletinWithCreator[], error: null };
    }

    const userMap = new Map((users ?? []).map((u: any) => [u.id, u as User]));

    const withCreators: BulletinWithCreator[] = bulletins.map((b) => ({
      ...b,
      creator: userMap.get(b.creator_id)
        ? {
            id: b.creator_id,
            full_name: userMap.get(b.creator_id)?.full_name ?? null,
            email: userMap.get(b.creator_id)?.email ?? '',
          }
        : undefined,
    }));

    return { data: withCreators, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function createBulletin(input: BulletinInput): Promise<{
  data: Bulletin | null;
  error: Error | null;
}> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: null, error: new Error('Not authenticated') };
    }

    const { data, error } = await ((supabase
      .from('bulletins') as any)
      .insert({
        title: input.title,
        body: input.body,
        creator_id: user.id,
        expires_at: input.expiresAt ?? null,
      })
      .select('*')
      .single());

    if (error) {
      return { data: null, error: error as Error };
    }

    return { data: data as Bulletin, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function updateBulletin(
  id: string,
  input: BulletinInput
): Promise<{ data: Bulletin | null; error: Error | null }> {
  try {
    const { data, error } = await ((supabase
      .from('bulletins') as any)
      .update({
        title: input.title,
        body: input.body,
        expires_at: input.expiresAt ?? null,
      })
      .eq('id', id)
      .select('*')
      .single());

    if (error) {
      return { data: null, error: error as Error };
    }

    return { data: data as Bulletin, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function deleteBulletin(id: string): Promise<{
  error: Error | null;
}> {
  try {
    const { error } = await ((supabase
      .from('bulletins') as any)
      .update({
        deleted_at: new Date().toISOString(),
      })
      .eq('id', id));

    if (error) {
      return { error: error as Error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

