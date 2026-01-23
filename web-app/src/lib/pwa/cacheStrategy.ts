/**
 * Cache Strategy Utilities
 * 
 * Provides helper functions for determining caching strategies
 * and validating what should/shouldn't be cached.
 */

/**
 * Check if a URL should never be cached
 */
export function shouldNeverCache(url: string): boolean {
  const neverCachePatterns = [
    /\/auth\/v1\//,
    /\/storage\/v1\/.*upload/,
    /\/functions\/v1\//,
  ];
  
  return neverCachePatterns.some(pattern => pattern.test(url));
}

/**
 * Check if a request has authentication token
 */
export function hasAuthToken(request: Request): boolean {
  return request.headers.get('Authorization')?.startsWith('Bearer ') ?? false;
}

/**
 * Check if a request is a write operation
 */
export function isWriteOperation(request: Request): boolean {
  return ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method);
}

/**
 * Check if a URL is a Supabase API endpoint
 */
export function isSupabaseAPI(url: string): boolean {
  return url.includes('/rest/v1/') || url.includes('/storage/v1/');
}

/**
 * Check if a request is for static assets
 */
export function isStaticAsset(request: Request, url: URL): boolean {
  const staticExtensions = /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|ico)$/;
  const staticDestinations = ['script', 'style', 'image', 'font'];
  
  return (
    staticExtensions.test(url.pathname) ||
    staticDestinations.includes(request.destination)
  );
}

/**
 * Check if a response should be cached
 */
export function shouldCacheResponse(response: Response, request: Request): boolean {
  // Only cache successful responses
  if (response.status !== 200) {
    return false;
  }
  
  // Never cache write operations
  if (isWriteOperation(request)) {
    return false;
  }
  
  // Never cache if request has auth token
  if (hasAuthToken(request)) {
    return false;
  }
  
  // Never cache certain endpoints
  if (shouldNeverCache(request.url)) {
    return false;
  }
  
  // Check cache-control header
  const cacheControl = response.headers.get('cache-control');
  if (cacheControl?.includes('no-store') || cacheControl?.includes('no-cache')) {
    return false;
  }
  
  return true;
}

/**
 * Get cache name based on resource type
 */
export function getCacheName(resourceType: 'app-shell' | 'static' | 'api', version: string): string {
  const prefixes = {
    'app-shell': 'app-shell',
    'static': 'static-assets',
    'api': 'api-cache',
  };
  
  return `${prefixes[resourceType]}-${version}`;
}
