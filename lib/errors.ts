// Global error handler and logging
export class AppError extends Error {
  constructor(public message: string, public code: string = 'UNKNOWN_ERROR') {
    super(message);
  }
}

export async function handleApiError(response: Response) {
  if (!response.ok) {
    const data = await response.json();
    throw new AppError(data.error || 'API Error', `HTTP_${response.status}`);
  }
  return response.json();
}

export function formatError(error: unknown): string {
  if (error instanceof AppError) {
    return typeof error.message === 'string' ? error.message : JSON.stringify(error.message);
  }
  if (error instanceof Error) {
    return typeof error.message === 'string' ? error.message : JSON.stringify(error.message);
  }
  return 'An unexpected error occurred';
}

export function logError(error: unknown, context: string) {
  const message = formatError(error);
  console.error(`[${context}]`, message);
  
  // In production, send to error tracking service
  if (process.env.NODE_ENV === 'production') {
    // Example: Sentry.captureException(error);
  }
}
