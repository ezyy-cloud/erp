import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface UserAvatarProps {
  userId?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showName?: boolean;
}

export function UserAvatar({ userId, size = 'md', className, showName = false }: UserAvatarProps) {
  const { appUser, user } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Use provided userId or current user
  const targetUserId = userId ?? user?.id ?? appUser?.id;
  const targetUser = userId ? null : appUser; // Only use appUser if viewing own profile

  useEffect(() => {
    if (!targetUserId) {
      setLoading(false);
      return;
    }

    // If we have appUser data and it's the current user, use that
    if (targetUser?.avatar_url) {
      loadAvatar(targetUser.avatar_url);
    } else if (targetUserId) {
      // Fetch user data to get avatar_url
      (supabase.from('users') as any)
        .select('avatar_url')
        .eq('id', targetUserId)
        .single()
        .then((result: any) => {
          const { data, error } = result;
          if (!error && data?.avatar_url) {
            loadAvatar(data.avatar_url);
          } else {
            setLoading(false);
          }
        });
    }
  }, [targetUserId, targetUser?.avatar_url]);

  const loadAvatar = async (url: string) => {
    try {
      // If it's a storage path, get the public URL
      if (url.startsWith('avatars/')) {
        // Remove 'avatars/' prefix for getPublicUrl
        const path = url.replace('avatars/', '');
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        setAvatarUrl(data.publicUrl);
      } else if (url.startsWith('http')) {
        // Already a full URL
        setAvatarUrl(url);
      } else {
        // Try as storage path (without bucket prefix)
        const { data } = supabase.storage.from('avatars').getPublicUrl(url);
        setAvatarUrl(data.publicUrl);
      }
    } catch (error) {
      console.error('Error loading avatar:', error);
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = () => {
    const name = targetUser?.full_name ?? user?.user_metadata?.full_name ?? user?.email ?? '';
    if (!name) return '?';
    
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
    xl: 'h-16 w-16 text-lg',
  };

  if (loading) {
    return (
      <div
        className={cn(
          'rounded-full bg-muted animate-pulse',
          sizeClasses[size],
          className
        )}
      />
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold shrink-0 overflow-hidden',
          sizeClasses[size]
        )}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={targetUser?.full_name ?? 'User avatar'}
            className="w-full h-full object-cover"
            onError={() => setAvatarUrl(null)} // Fallback to initials on error
          />
        ) : (
          <span>{getInitials()}</span>
        )}
      </div>
      {showName && targetUser?.full_name && (
        <span className="text-sm font-medium">{targetUser.full_name}</span>
      )}
    </div>
  );
}
