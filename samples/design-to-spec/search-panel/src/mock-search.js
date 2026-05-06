// Mock implementation of GET /api/v1/search for the local dev server.
// In a real project this would be replaced by a real fetch call:
//
//   const res = await fetch(`/api/v1/search?keyword=${...}&page=${...}`, { signal });
//   return res.json();
//
// The mock honors the AbortSignal so that the abort path in main.js is
// exercised end-to-end without a backend.

const STORAGE_KEY = "search-panel.mock-mode";

let _rateLimitedFlipFlop = false; // first call returns RATE_LIMITED, retry returns success

export function getMockMode() {
  return localStorage.getItem(STORAGE_KEY) || "success";
}

export function setMockMode(mode) {
  localStorage.setItem(STORAGE_KEY, mode);
  _rateLimitedFlipFlop = false;
}

const SAMPLE_RESULTS = [
  {
    id: "r-001",
    title: "useEffect 入门指南",
    summary: "React 副作用钩子的使用、依赖数组、清理函数的常见陷阱…",
    score: 0.92,
  },
  {
    id: "r-002",
    title: "自定义 Hook 设计模式",
    summary: "如何抽离复用逻辑到 useXxx 钩子函数…",
    score: 0.87,
  },
  {
    id: "r-003",
    title: "useState 性能陷阱",
    summary: null, // exercise summary-null hide path
    score: 0.81,
  },
];

export function mockSearch({ keyword, page = 1, signal }) {
  return new Promise((resolve, reject) => {
    const delay = 600;
    const timer = setTimeout(() => {
      const mode = getMockMode();
      resolve(buildResponse(mode, keyword, page));
    }, delay);

    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    }
  });
}

function buildResponse(mode, keyword, page) {
  switch (mode) {
    case "empty":
      return {
        code: 0,
        message: "OK",
        data: { results: [], total: 0, page, page_size: 10 },
      };

    case "network-error":
      return {
        code: "NETWORK_ERROR",
        message: "Failed to reach upstream",
        data: null,
      };

    case "rate-limited": {
      // First call returns RATE_LIMITED; subsequent (auto-retry) returns success.
      const flip = _rateLimitedFlipFlop;
      _rateLimitedFlipFlop = !flip;
      if (!flip) {
        return {
          code: "RATE_LIMITED",
          message: "Too many requests",
          data: null,
        };
      }
      return successResponse(keyword, page);
    }

    case "invalid-keyword":
      return {
        code: "INVALID_KEYWORD",
        message: "关键词长度必须在 1–32 之间",
        data: null,
      };

    case "forbidden":
      return {
        code: "FORBIDDEN",
        message: "Login required",
        data: null,
      };

    case "internal-error":
      return {
        code: "INTERNAL_ERROR",
        message: "Server exploded",
        data: null,
      };

    case "success":
    default:
      return successResponse(keyword, page);
  }
}

function successResponse(keyword, page) {
  return {
    code: 0,
    message: "OK",
    data: {
      results: SAMPLE_RESULTS,
      total: SAMPLE_RESULTS.length,
      page,
      page_size: 10,
    },
  };
}
