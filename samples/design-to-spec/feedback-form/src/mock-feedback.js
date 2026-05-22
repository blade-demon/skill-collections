// Mock implementation of POST /api/v1/feedback for the local dev server.
// Honors AbortSignal so the abort path in main.js is exercised end-to-end
// without a backend.

const STORAGE_KEY = 'feedback-form.mock-mode';

export function getMockMode() {
  return localStorage.getItem(STORAGE_KEY) || 'success';
}

export function setMockMode(mode) {
  localStorage.setItem(STORAGE_KEY, mode);
}

export function mockSubmitFeedback({ signal }) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve(buildResponse(getMockMode()));
    }, 800);

    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }
  });
}

function buildResponse(mode) {
  switch (mode) {
    case 'validation-failed':
      return {
        code: 'VALIDATION_FAILED',
        message: '字段校验失败',
        data: {
          field_errors: {
            email: '该邮箱已被禁用，请换一个',
          },
        },
      };

    case 'rate-limited':
      return {
        code: 'RATE_LIMITED',
        message: '提交过于频繁，请稍后再试',
        data: null,
      };

    case 'network-error':
      return {
        code: 'NETWORK_ERROR',
        message: '请检查网络后重试',
        data: null,
      };

    case 'forbidden':
      return {
        code: 'FORBIDDEN',
        message: 'Login required',
        data: null,
      };

    case 'internal-error':
      return {
        code: 'INTERNAL_ERROR',
        message: '服务暂时不可用',
        data: null,
      };

    case 'success':
    default:
      return {
        code: 0,
        message: 'OK',
        data: {
          feedback_id: `FB-${Math.floor(1000 + Math.random() * 9000)}`,
          submitted_at: new Date().toISOString(),
        },
      };
  }
}
