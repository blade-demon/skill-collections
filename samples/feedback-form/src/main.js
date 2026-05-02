// FeedbackForm — minimal vanilla implementation
//
// Source of truth for behavior is design-spec/feedback-form/specs/feedback-form/spec.md.
// Source of truth for fetch + error semantics is design-spec/feedback-form/data-fetching.md.
// Source of truth for component structure is design-spec/feedback-form/contracts/ui-schema.yaml.
//
// Trace anchors in the DOM (`data-trace="component:..."`) tie rendered nodes
// back to the contract so a reader can navigate spec.md → src by id.

import { mockSubmitFeedback, getMockMode, setMockMode } from "./mock-feedback.js";

// ---------------------------------------------------------------------------
// 1. Form state (component:feedbackForm)
// ---------------------------------------------------------------------------

const STAR_PATH = "M10 1.5 l2.5 6 6.5 0 -5 4 2 6 -5.5 -4 -5.5 4 2 -6 -5 -4 6.5 0 z";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_SECONDS = 30;

const formState = {
  state: "idle",
  rating: 0,
  comment: "",
  email: "",
  emailFieldInvalid: false,
  commentFieldInvalid: false,
  errorBanner: "",
  fieldErrors: {},        // from VALIDATION_FAILED.data.field_errors
  feedbackId: "",
  rateLimitDeadline: 0,   // timestamp at which rateLimited expires
  inFlightController: null,
};

const root = document.querySelector("#feedback-form");
const mockModeEl = document.querySelector("#mock-mode");
mockModeEl.value = getMockMode();
mockModeEl.addEventListener("change", (e) => setMockMode(e.target.value));

// ---------------------------------------------------------------------------
// 2. Render (one DOM tree per state shape)
// ---------------------------------------------------------------------------

function render() {
  root.dataset.state = formState.state;

  if (formState.state === "success") {
    renderSuccess();
    return;
  }

  renderForm();
}

function renderForm() {
  const isSubmitting = formState.state === "submitting";
  const banner = formState.errorBanner
    ? `<div class="feedback-form__error-banner" data-trace="component:errorBanner">${escapeHtml(formState.errorBanner)}</div>`
    : "";

  const ratingDisabled = isSubmitting ? "true" : "false";

  // Per-field invalid flags combine local validation + backend field_errors
  const emailFieldErr = formState.fieldErrors.email || "";
  const commentFieldErr = formState.fieldErrors.comment || "";
  const emailInvalid = formState.emailFieldInvalid || !!emailFieldErr;
  const commentInvalid = formState.commentFieldInvalid || !!commentFieldErr;

  const emailHintText = emailFieldErr || (formState.emailFieldInvalid ? "邮箱格式不正确" : "");
  const commentHintText = commentFieldErr || (formState.commentFieldInvalid ? "评论至少 5 个字符" : "");

  root.innerHTML = `
    <h2 class="feedback-form__title" data-trace="component:formTitle">分享你的反馈</h2>
    ${banner}

    <div class="field" data-trace="component:ratingGroup">
      <label class="field__label" data-trace="component:ratingLabel">评分 <span class="required">*</span></label>
      <div class="rating-group" data-trace="component:ratingGroup" data-disabled="${ratingDisabled}">
        ${[1, 2, 3, 4, 5].map((n) => `
          <svg class="rating-star ${n <= formState.rating ? "is-filled" : ""}"
               data-rating-value="${n}"
               viewBox="0 0 20 20">
            <path d="${STAR_PATH}" />
          </svg>
        `).join("")}
      </div>
    </div>

    <div class="field ${commentInvalid ? "field--invalid" : ""}" data-trace="component:commentField">
      <label class="field__label" for="comment" data-trace="component:commentLabel">评论 <span class="required">*</span></label>
      <textarea id="comment" class="field__textarea"
                placeholder="告诉我们您的想法…"
                ${isSubmitting ? "disabled" : ""}>${escapeHtml(formState.comment)}</textarea>
      <div class="field__hint" data-trace="component:commentHint">${escapeHtml(commentHintText)}</div>
    </div>

    <div class="field ${emailInvalid ? "field--invalid" : ""}" data-trace="component:emailField">
      <label class="field__label" for="email" data-trace="component:emailLabel">邮箱（可选）</label>
      <input id="email" class="field__input" type="email"
             value="${escapeHtml(formState.email)}"
             placeholder="name@example.com"
             ${isSubmitting ? "disabled" : ""} />
      <div class="field__hint" data-trace="component:emailHint">${escapeHtml(emailHintText)}</div>
    </div>

    <button class="feedback-form__submit"
            data-trace="component:submitBtn"
            data-loading="${isSubmitting}"
            ${shouldDisableSubmit() ? "disabled" : ""}>
      ${submitLabel()}
    </button>
  `;

  // Wire up event listeners
  root.querySelectorAll(".rating-star").forEach((el) => {
    el.addEventListener("click", () => {
      if (isSubmitting) return;
      const n = Number(el.dataset.ratingValue);
      // Tap same star again to clear (per interaction-notes)
      formState.rating = formState.rating === n ? 0 : n;
      // Editing any field while in error/validationFailed → clear banner & errors
      clearTransientErrorsOnEdit();
      render();
    });
  });

  const commentEl = root.querySelector("#comment");
  commentEl.addEventListener("input", (e) => {
    formState.comment = e.target.value;
    if (formState.commentFieldInvalid) formState.commentFieldInvalid = false;
    if (formState.fieldErrors.comment) delete formState.fieldErrors.comment;
    clearTransientErrorsOnEdit();
    syncSubmitButtonOnly();
  });
  commentEl.addEventListener("blur", () => {
    formState.commentFieldInvalid = formState.comment.trim().length < 5 && formState.comment.length > 0;
    render();
  });

  const emailEl = root.querySelector("#email");
  emailEl.addEventListener("input", (e) => {
    formState.email = e.target.value;
    if (formState.emailFieldInvalid) formState.emailFieldInvalid = false;
    if (formState.fieldErrors.email) delete formState.fieldErrors.email;
    clearTransientErrorsOnEdit();
    syncSubmitButtonOnly();
  });
  emailEl.addEventListener("blur", () => {
    formState.emailFieldInvalid = formState.email !== "" && !EMAIL_RE.test(formState.email);
    render();
  });

  const submitEl = root.querySelector(".feedback-form__submit");
  submitEl.addEventListener("click", () => submit());
}

function renderSuccess() {
  root.innerHTML = `
    <div class="feedback-form__success" data-trace="state:success">
      <div class="success-icon" data-trace="component:successIcon">
        <svg viewBox="0 0 32 32">
          <path d="M8 16 L14 22 L26 10" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <div class="success-title" data-trace="component:successTitle">感谢您的反馈！</div>
      <div class="success-body" data-trace="component:successBody">我们已收到您的意见</div>
      <div class="success-feedback-id" data-trace="component:feedbackIdText">参考编号 #${escapeHtml(formState.feedbackId)}</div>
      <button class="reset-button" data-trace="component:resetButton">再提交一条</button>
    </div>
  `;
  root.querySelector(".reset-button").addEventListener("click", () => {
    emitTrackingEvent("tap-feedback-reset", { feedback_id: formState.feedbackId });
    Object.assign(formState, {
      state: "idle",
      rating: 0,
      comment: "",
      email: "",
      emailFieldInvalid: false,
      commentFieldInvalid: false,
      errorBanner: "",
      fieldErrors: {},
      feedbackId: "",
    });
    render();
  });
}

// ---------------------------------------------------------------------------
// 3. Computed helpers
// ---------------------------------------------------------------------------

function frontendValidationPasses() {
  if (formState.rating < 1 || formState.rating > 5) return false;
  if (formState.comment.trim().length < 5) return false;
  if (formState.email !== "" && !EMAIL_RE.test(formState.email)) return false;
  return true;
}

function shouldDisableSubmit() {
  if (formState.state === "submitting") return true;
  if (formState.state === "rateLimited" && Date.now() < formState.rateLimitDeadline) return true;
  return !frontendValidationPasses();
}

function submitLabel() {
  if (formState.state === "rateLimited" && Date.now() < formState.rateLimitDeadline) {
    const remaining = Math.ceil((formState.rateLimitDeadline - Date.now()) / 1000);
    return `请等待 ${remaining}s`;
  }
  return "提交反馈";
}

function syncSubmitButtonOnly() {
  // Optimization: only re-render if disabled state would flip. For simplicity
  // here we just re-render the whole form (small enough); a real impl would
  // surgically toggle the disabled attribute.
  const btn = root.querySelector(".feedback-form__submit");
  if (!btn) return;
  btn.disabled = shouldDisableSubmit();
  btn.textContent = submitLabel();
}

function clearTransientErrorsOnEdit() {
  // state_machine: validationFailed/error → idle when user edits a field
  if (formState.state === "validationFailed" || formState.state === "error") {
    formState.state = "idle";
    formState.errorBanner = "";
  }
}

// ---------------------------------------------------------------------------
// 4. Submit lifecycle (request:submitRequest)
// ---------------------------------------------------------------------------

async function submit() {
  if (!frontendValidationPasses()) return;

  // ui_to_event tap-feedback-submit
  emitTrackingEvent("tap-feedback-submit", {
    rating: formState.rating,
    comment_length: formState.comment.length,
    email_provided: formState.email !== "",
  });

  // concurrency_policy.abortable
  if (formState.inFlightController) {
    formState.inFlightController.abort();
    formState.inFlightController = null;
  }

  formState.state = "submitting";
  formState.errorBanner = "";
  formState.fieldErrors = {};
  render();

  const controller = new AbortController();
  formState.inFlightController = controller;

  // bindings: ui_to_api for rating / comment / email
  const body = {
    rating: formState.rating,
    comment: formState.comment.trim(),
  };
  if (formState.email !== "") {
    body.email = formState.email.trim();
  }

  let response;
  try {
    response = await mockSubmitFeedback({ body, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") return; // stale; drop
    transitionToError("NETWORK_ERROR", "请检查网络后重试");
    return;
  }
  if (controller !== formState.inFlightController) return;
  formState.inFlightController = null;

  // state_machine: submitting → success / validationFailed / rateLimited / error / idle(forbidden)
  if (response.code === 0) {
    formState.feedbackId = response.data.feedback_id;
    formState.state = "success";
    emitTrackingEvent("view-feedback-success", {
      feedback_id: formState.feedbackId,
      rating: formState.rating,
    });
    render();
    return;
  }

  if (response.code === "VALIDATION_FAILED") {
    formState.state = "validationFailed";
    formState.errorBanner = response.message;
    formState.fieldErrors = response.data?.field_errors || {};
    emitTrackingEvent("view-feedback-error", {
      error_code: response.code,
      field_errors: Object.keys(formState.fieldErrors),
    });
    render();
    return;
  }

  if (response.code === "RATE_LIMITED") {
    formState.state = "rateLimited";
    formState.rateLimitDeadline = Date.now() + RATE_LIMIT_SECONDS * 1000;
    showToast(`提交过于频繁，请 ${RATE_LIMIT_SECONDS} 秒后再试`);
    emitTrackingEvent("view-feedback-error", {
      error_code: response.code,
      field_errors: [],
    });
    startRateLimitCountdown();
    render();
    return;
  }

  if (response.code === "FORBIDDEN") {
    console.log("[nav] would redirect to /login (sample stub)");
    formState.state = "idle";
    render();
    return;
  }

  // NETWORK_ERROR / INTERNAL_ERROR
  transitionToError(response.code, errorMessage(response.code, response.message));
}

function transitionToError(code, message) {
  formState.state = "error";
  formState.errorBanner = message;
  emitTrackingEvent("view-feedback-error", {
    error_code: code,
    field_errors: [],
  });
  render();
}

function errorMessage(code, fallback) {
  switch (code) {
    case "NETWORK_ERROR":
      return "请检查网络后重试";
    case "INTERNAL_ERROR":
      return "服务暂时不可用";
    default:
      return fallback || "提交失败";
  }
}

// ---------------------------------------------------------------------------
// 5. Rate-limit countdown
// ---------------------------------------------------------------------------

let countdownTimer = null;
function startRateLimitCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    if (Date.now() >= formState.rateLimitDeadline) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      formState.state = "idle";
      formState.rateLimitDeadline = 0;
      hideToast();
      render();
    } else {
      // Refresh just the button label
      syncSubmitButtonOnly();
    }
  }, 1000);
}

// ---------------------------------------------------------------------------
// 6. Toast
// ---------------------------------------------------------------------------

let toastEl = null;
function showToast(text) {
  hideToast();
  toastEl = document.createElement("div");
  toastEl.className = "toast";
  toastEl.textContent = text;
  document.body.appendChild(toastEl);
}
function hideToast() {
  if (toastEl) { toastEl.remove(); toastEl = null; }
}

// ---------------------------------------------------------------------------
// 7. Tracking + util
// ---------------------------------------------------------------------------

function emitTrackingEvent(name, payload) {
  console.log(`[tracking] ${name}`, payload);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

// ---------------------------------------------------------------------------
// 8. Initial render
// ---------------------------------------------------------------------------

render();
