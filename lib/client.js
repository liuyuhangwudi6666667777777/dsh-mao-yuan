window.__ModuleLoader__.load({ id: 'dsh-mao-yuan', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";

var react = require("react");
var jsxRuntime = require("react/jsx-runtime");
var useEffect = react.useEffect;
var useRef = react.useRef;
var jsx = jsxRuntime.jsx;
var jsxs = jsxRuntime.jsxs;

var SLOT_LEFT = "conversation.input.left";
var PREFIX = "/maoxuan ";
var OFF_WORDS = ["off", "关", "关闭", "停止", "退出"];

/** 会话级状态：sessionId -> { active } */
var states = new Map();

function stateOf(sessionId) {
  var key = String(sessionId == null ? "" : sessionId);
  var s = states.get(key);
  if (!s) {
    s = { active: false };
    states.set(key, s);
  }
  return s;
}

/** 草稿是否干净：空或只有 /maoxuan */
function isPristine(draft) {
  var t = String(draft == null ? "" : draft).trim();
  return t === "" || t === "/maoxuan";
}

/** 草稿是否以 /maoxuan 开头 */
function hasPrefix(draft) {
  return /^\s*\/maoxuan(\s|$)/i.test(String(draft == null ? "" : draft));
}

/** 是否是关闭指令（只认首词） */
function isOffCommand(draft) {
  var m = /^\s*\/maoxuan(?=\s|$)([^\n]*)/i.exec(String(draft == null ? "" : draft));
  if (!m) return false;
  var first = (m[1].trim().split(/\s+/)[0] || "").toLowerCase();
  return OFF_WORDS.indexOf(first) >= 0;
}

var pillStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  padding: "2px 8px",
  marginRight: "4px",
  border: "none",
  borderRadius: "999px",
  fontSize: "12px",
  lineHeight: "18px",
  cursor: "pointer",
  userSelect: "none",
  color: "#fff",
  background: "#b91c1c",
  whiteSpace: "nowrap",
};

function MaoYuanPill(props) {
  var useInput = props.useInput;
  var inputActions = props.inputActions;
  var sessionId = props.sessionId;

  var draft = useInput(function (s) { return s.draft; });
  var st = stateOf(sessionId);
  var lastDraft = useRef(draft);

  // 观察输入，切换状态
  useEffect(function () {
    var prev = lastDraft.current == null ? "" : lastDraft.current;
    lastDraft.current = draft == null ? "" : draft;

    if (isOffCommand(draft)) {
      st.active = false;
      return;
    }
    if (hasPrefix(draft) && !hasPrefix(prev)) {
      st.active = true;
    }
  }, [draft, st]);

  // 自动预填：开启且草稿干净时补前缀
  useEffect(function () {
    if (!st.active) return;
    if (!isPristine(draft)) return;
    if (hasPrefix(draft)) return;
    inputActions.setDraft(PREFIX);
  }, [st.active, draft, inputActions]);

  if (!st.active) return null;

  return jsxs("button", {
    type: "button",
    className: "dsh-mao-yuan-pill",
    title: "毛选模式已开启（本会话持续生效）。点击关闭。",
    onClick: function () {
      st.active = false;
      if (isPristine(draft)) inputActions.setDraft("");
    },
    style: pillStyle,
    children: [
      jsx("span", { "aria-hidden": "true", children: "●" }),
      "毛选",
    ],
  });
}

var inject = ["slots"];

function apply(ctx) {
  var slots = ctx.slots;
  slots.inject(SLOT_LEFT, function () {
    return slots.register(
      { name: SLOT_LEFT, id: "mao-yuan-status", order: 5 },
      MaoYuanPill,
    );
  });
}

module.exports = { apply: apply, inject: inject };
return module.exports; } });
