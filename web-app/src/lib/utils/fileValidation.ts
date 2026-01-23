/**
 * File Upload Validation
 * Enforces allowed file types for task file uploads
 */

export const ALLOWED_FILE_EXTENSIONS = [
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'doc',
  'docx',
  'xls',
  'xlsx',
] as const;

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate file extension
 */
export function validateFileExtension(fileName: string): FileValidationResult {
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  if (!extension) {
    return {
      isValid: false,
      error: 'File must have an extension',
    };
  }

  if (!ALLOWED_FILE_EXTENSIONS.includes(extension as typeof ALLOWED_FILE_EXTENSIONS[number])) {
    return {
      isValid: false,
      error: `File type "${extension.toUpperCase()}" is not allowed. Allowed types: ${ALLOWED_FILE_EXTENSIONS.map(ext => ext.toUpperCase()).join(', ')}`,
    };
  }

  return { isValid: true };
}

/**
 * Validate file MIME type
 */
export function validateFileMimeType(mimeType: string): FileValidationResult {
  if (!mimeType) {
    return {
      isValid: false,
      error: 'File type could not be determined',
    };
  }

  const normalizedMimeType = mimeType.toLowerCase();
  
  if (!ALLOWED_MIME_TYPES.includes(normalizedMimeType as typeof ALLOWED_MIME_TYPES[number])) {
    return {
      isValid: false,
      error: `File type "${mimeType}" is not allowed. Allowed types: PDF, JPEG, PNG, DOC, DOCX, XLS, XLSX`,
    };
  }

  return { isValid: true };
}

/**
 * Validate file (checks both extension and MIME type)
 */
export function validateFile(file: File): FileValidationResult {
  // Check extension
  const extensionResult = validateFileExtension(file.name);
  if (!extensionResult.isValid) {
    return extensionResult;
  }

  // Check MIME type
  const mimeResult = validateFileMimeType(file.type);
  if (!mimeResult.isValid) {
    // If MIME type check fails but extension is valid, still allow it
    // (some browsers don't set MIME types correctly)
    // But log a warning
    console.warn(`MIME type validation failed for ${file.name}, but extension is valid`);
    return { isValid: true };
  }

  return { isValid: true };
}

/**
 * Get allowed file types display string
 */
export function getAllowedFileTypesDisplay(): string {
  return ALLOWED_FILE_EXTENSIONS.map(ext => ext.toUpperCase()).join(', ');
}
