import { useEffect, useMemo, useState } from 'react';

export type UiLanguage = 'zh-CN' | 'en';

const STORAGE_KEY = 'ui_language';
const LANGUAGE_EVENT = 'clientLanguageChanged';

const TRANSLATION_PAIRS: Array<[string, string]> = [
  ['New chat', '\u65b0\u5efa\u804a\u5929'],
  ['New Chat', '\u65b0\u5efa\u804a\u5929'],
  ['New Conversation', '\u65b0\u5bf9\u8bdd'],
  ['Search', '\u641c\u7d22'],
  ['Customize', '\u81ea\u5b9a\u4e49'],
  ['Chats', '\u804a\u5929'],
  ['Projects', '\u9879\u76ee'],
  ['Artifacts', '\u4f5c\u54c1'],
  ['Recents', '\u6700\u8fd1'],
  ['Show', '\u663e\u793a'],
  ['Hide', '\u9690\u85cf'],
  ['All chats', '\u5168\u90e8\u804a\u5929'],
  ['User', '\u7528\u6237'],
  ['Self-hosted', '\u81ea\u6258\u7ba1'],
  ['Settings', '\u8bbe\u7f6e'],
  ['General', '\u901a\u7528'],
  ['Models', '\u6a21\u578b'],
  ['Account', '\u8d26\u6237'],
  ['Usage', '\u7528\u91cf'],
  ['Personal Info', '\u4e2a\u4eba\u8d44\u6599'],
  ['Full name', '\u5168\u540d'],
  ['Claude should call you what?', 'Claude \u5e94\u8be5\u600e\u4e48\u79f0\u547c\u4f60?'],
  ['Enter your full name', '\u8f93\u5165\u4f60\u7684\u5168\u540d'],
  ['For example your name or nickname', '\u4f8b\u5982\u4f60\u7684\u540d\u5b57\u6216\u6635\u79f0'],
  ['What do you do?', '\u4f60\u7684\u804c\u4e1a\u662f\u4ec0\u4e48?'],
  ['Select your occupation', '\u9009\u62e9\u4f60\u7684\u804c\u4e1a'],
  ['What personal preferences should Claude consider in responses?', 'Claude \u5728\u56de\u590d\u4e2d\u5e94\u8003\u8651\u54ea\u4e9b\u4e2a\u4eba\u504f\u597d?'],
  ['Your preferences will apply to all conversations.', '\u4f60\u7684\u504f\u597d\u5c06\u5e94\u7528\u4e8e\u6240\u6709\u5bf9\u8bdd\u3002'],
  ['For example: keep answers concise, use Chinese, keep code comments in English', '\u4f8b\u5982\uff1a\u56de\u7b54\u5c3d\u91cf\u7b80\u6d01\uff0c\u4f7f\u7528\u4e2d\u6587\uff0c\u4ee3\u7801\u6ce8\u91ca\u7528\u82f1\u6587'],
  ['Default model', '\u9ed8\u8ba4\u6a21\u578b'],
  ['Model used for new chats', '\u65b0\u5bf9\u8bdd\u9ed8\u8ba4\u4f7f\u7528\u7684\u6a21\u578b'],
  ['Extended thinking', '\u6269\u5c55\u601d\u8003'],
  ['Let the model think more deeply before answering', '\u8ba9\u6a21\u578b\u5728\u56de\u7b54\u524d\u8fdb\u884c\u66f4\u6df1\u5ea6\u7684\u601d\u8003'],
  ['Send Message', '\u53d1\u9001\u6d88\u606f'],
  ['Send message', '\u53d1\u9001\u6d88\u606f'],
  ['New line', '\u6362\u884c'],
  ['Appearance', '\u5916\u89c2'],
  ['Color theme', '\u989c\u8272\u6a21\u5f0f'],
  ['Chat font', '\u804a\u5929\u5b57\u4f53'],
  ['Default', '\u9ed8\u8ba4'],
  ['System', '\u7cfb\u7edf'],
  ['Dyslexic', '\u9605\u8bfb\u969c\u788d'],
  ['Interface language', '\u754c\u9762\u8bed\u8a00'],
  ['Chinese', '\u4e2d\u6587'],
  ['English', '\u82f1\u6587'],
  ['User mode', '\u7528\u6237\u6a21\u5f0f'],
  ['Use your own API Key', '\u4f7f\u7528\u81ea\u5df1\u7684 API Key'],
  ['Use hosted API service', '\u4f7f\u7528\u6258\u7ba1 API \u670d\u52a1'],
  ['About', '\u5173\u4e8e'],
  ['Current version', '\u5f53\u524d\u7248\u672c'],
  ['Rename chat', '\u91cd\u547d\u540d\u804a\u5929'],
  ['Cancel', '\u53d6\u6d88'],
  ['Save', '\u4fdd\u5b58'],
  ['Menu', '\u83dc\u5355'],
  ['Expand sidebar', '\u5c55\u5f00\u4fa7\u8fb9\u680f'],
  ['Collapse sidebar', '\u6536\u8d77\u4fa7\u8fb9\u680f'],
  ['Back', '\u540e\u9000'],
  ['Forward', '\u524d\u8fdb'],
  ['Chat', '\u804a\u5929'],
  ['Cowork', '\u534f\u4f5c'],
  ['Code', '\u4ee3\u7801'],
  ['Star', '\u6536\u85cf'],
  ['Rename', '\u91cd\u547d\u540d'],
  ['Delete', '\u5220\u9664'],
  ['View Artifacts', '\u67e5\u770b\u4f5c\u54c1'],
  ['Open Workspace Folder', '\u6253\u5f00\u5de5\u4f5c\u533a\u6587\u4ef6\u5939'],
  ['Help', '\u5e2e\u52a9'],
  ['Get Help', '\u552e\u540e\u652f\u6301'],
  ['Log out', '\u9000\u51fa\u767b\u5f55'],
  ['Logout', '\u9000\u51fa\u767b\u5f55'],
  ['Admin Panel', '\u7ba1\u7406\u9762\u677f'],
  ['Payment', '\u5957\u9910\u8d2d\u4e70'],
  ['Login', '\u767b\u5f55'],
  ['Register', '\u6ce8\u518c'],
  ['Email', '\u90ae\u7bb1'],
  ['Password', '\u5bc6\u7801'],
  ['Provider', '\u670d\u52a1\u5546'],
  ['Providers', '\u670d\u52a1\u5546'],
  ['Upload', '\u4e0a\u4f20'],
  ['Send', '\u53d1\u9001'],
  ['Continue', '\u7ee7\u7eed'],
  ['Start', '\u5f00\u59cb'],
  ['Import', '\u5bfc\u5165'],
  ['Export', '\u5bfc\u51fa'],
  ['Skill', '\u6280\u80fd'],
  ['Downloading update...', '\u6b63\u5728\u4e0b\u8f7d\u66f4\u65b0...'],
  ['Relaunch to apply', '\u91cd\u542f\u540e\u751f\u6548'],
  ['Relaunch', '\u91cd\u542f'],
  ['Add content from GitHub', '\u4ece GitHub \u6dfb\u52a0\u5185\u5bb9'],
  ['Select a repository', '\u9009\u62e9\u4ed3\u5e93'],
  ['Connect GitHub', '\u8fde\u63a5 GitHub'],
  ['Open', '\u6253\u5f00'],
  ['Add to chat', '\u6dfb\u52a0\u5230\u5bf9\u8bdd'],
  ['Waiting for GitHub...', '\u7b49\u5f85 GitHub \u6388\u6743...'],
  ['Loading repositories...', '\u6b63\u5728\u52a0\u8f7d\u4ed3\u5e93...'],
  ['No repositories found', '\u672a\u627e\u5230\u4ed3\u5e93'],
  ['Loading...', '\u52a0\u8f7d\u4e2d...'],
  ['Empty folder', '\u7a7a\u6587\u4ef6\u5939'],
  ['No active sessions', '\u6ca1\u6709\u6d3b\u8dc3\u4f1a\u8bdd'],
  ['Unknown Device', '\u672a\u77e5\u8bbe\u5907'],
  ['Unknown Location', '\u672a\u77e5\u4f4d\u7f6e'],
  ['Current', '\u5f53\u524d'],
  ['Confirm log out?', '\u786e\u8ba4\u9000\u51fa\u767b\u5f55?'],
  ['This action will clear the sign-in state on this device.', '\u6b64\u64cd\u4f5c\u4f1a\u6e05\u9664\u5f53\u524d\u8bbe\u5907\u4e0a\u7684\u767b\u5f55\u72b6\u6001\u3002'],
  ['Support QQ:', '\u552e\u540e QQ\uff1a'],
  ['Close', '\u5173\u95ed'],
  ['Light', 'Light'],
  ['Auto', 'Auto'],
  ['Dark', 'Dark'],
  ['Enter', '\u56de\u8f66'],
  ['Shift+Enter', 'Shift+Enter'],
  ['Ctrl+Enter', 'Ctrl+Enter'],
  ['Alt+Enter', 'Alt+Enter'],
  ['Cmd+Enter', 'Cmd+Enter'],
];

const exactEnToZh: Record<string, string> = Object.fromEntries(TRANSLATION_PAIRS);
const exactZhToEn: Record<string, string> = Object.fromEntries(TRANSLATION_PAIRS.map(([en, zh]) => [zh, en]));

const partialEnToZh: Array<[RegExp, string]> = [
  [/^Evening, there$/i, '\u665a\u4e0a\u597d'],
  [/^Morning, there$/i, '\u65e9\u4e0a\u597d'],
  [/^Afternoon, there$/i, '\u4e0b\u5348\u597d'],
  [/^How can I help you today\?$/i, '\u4eca\u5929\u60f3\u8ba9\u6211\u5e2e\u4f60\u505a\u4ec0\u4e48\uff1f'],
  [/^Updated to (.+)$/i, '\u5df2\u66f4\u65b0\u5230 $1'],
  [/^Downloading update\.\.\. ?(.*)$/i, '\u6b63\u5728\u4e0b\u8f7d\u66f4\u65b0... $1'],
  [/^No conversations yet$/i, '\u8fd8\u6ca1\u6709\u804a\u5929'],
  [/^No projects yet$/i, '\u8fd8\u6ca1\u6709\u9879\u76ee'],
  [/^No artifacts yet$/i, '\u8fd8\u6ca1\u6709\u4f5c\u54c1'],
  [/^Type a message.*$/i, '\u8f93\u5165\u6d88\u606f...'],
  [/^Ask anything.*$/i, '\u60f3\u95ee\u4ec0\u4e48\u90fd\u53ef\u4ee5...'],
  [/^Search chats.*$/i, '\u641c\u7d22\u804a\u5929...'],
  [/^Thinking Process:(.*)$/i, '\u601d\u8003\u8fc7\u7a0b:$1'],
  [/^The user is asking me to (.*)$/i, '\u7528\u6237\u6b63\u5728\u8ba9\u6211$1'],
  [/^Select the files you would like to add to this chat$/i, '\u9009\u62e9\u4f60\u60f3\u52a0\u5165\u5f53\u524d\u5bf9\u8bdd\u7684\u6587\u4ef6'],
  [/^Connect your GitHub account to browse repositories\.$/i, '\u8fde\u63a5\u4f60\u7684 GitHub \u8d26\u53f7\u540e\u5373\u53ef\u6d4f\u89c8\u4ed3\u5e93\u3002'],
  [/^Select a repository or paste a URL above to get started$/i, '\u9009\u62e9\u4e00\u4e2a\u4ed3\u5e93\uff0c\u6216\u5728\u4e0a\u65b9\u7c98\u8d34 GitHub \u94fe\u63a5\u5f00\u59cb\u3002'],
  [/^Select files to add to chat context$/i, '\u9009\u62e9\u8981\u52a0\u5165\u5bf9\u8bdd\u4e0a\u4e0b\u6587\u7684\u6587\u4ef6'],
  [/^(\d+)% of capacity used$/i, '$1% \u5bb9\u91cf\u5df2\u4f7f\u7528'],
  [/^(\d+) item selected$/i, '\u5df2\u9009\u62e9 $1 \u9879'],
  [/^(\d+) items selected$/i, '\u5df2\u9009\u62e9 $1 \u9879'],
];

const partialZhToEn: Array<[RegExp, string]> = [
  [/^\u665a\u4e0a\u597d$/i, 'Evening, there'],
  [/^\u65e9\u4e0a\u597d$/i, 'Morning, there'],
  [/^\u4e0b\u5348\u597d$/i, 'Afternoon, there'],
  [/^\u4eca\u5929\u60f3\u8ba9\u6211\u5e2e\u4f60\u505a\u4ec0\u4e48\uff1f$/i, 'How can I help you today?'],
  [/^\u5df2\u66f4\u65b0\u5230 (.+)$/i, 'Updated to $1'],
  [/^\u6b63\u5728\u4e0b\u8f7d\u66f4\u65b0\.\.\. ?(.*)$/i, 'Downloading update... $1'],
  [/^\u8fd8\u6ca1\u6709\u804a\u5929$/i, 'No conversations yet'],
  [/^\u8fd8\u6ca1\u6709\u9879\u76ee$/i, 'No projects yet'],
  [/^\u8fd8\u6ca1\u6709\u4f5c\u54c1$/i, 'No artifacts yet'],
  [/^\u8f93\u5165\u6d88\u606f\.\.\.$/i, 'Type a message...'],
  [/^\u60f3\u95ee\u4ec0\u4e48\u90fd\u53ef\u4ee5\.\.\.$/i, 'Ask anything...'],
  [/^\u641c\u7d22\u804a\u5929\.\.\.$/i, 'Search chats...'],
  [/^\u601d\u8003\u8fc7\u7a0b:(.*)$/i, 'Thinking Process:$1'],
  [/^\u9009\u62e9\u4f60\u60f3\u52a0\u5165\u5f53\u524d\u5bf9\u8bdd\u7684\u6587\u4ef6$/i, 'Select the files you would like to add to this chat'],
  [/^\u8fde\u63a5\u4f60\u7684 GitHub \u8d26\u53f7\u540e\u5373\u53ef\u6d4f\u89c8\u4ed3\u5e93\u3002$/i, 'Connect your GitHub account to browse repositories.'],
  [/^\u9009\u62e9\u4e00\u4e2a\u4ed3\u5e93\uff0c\u6216\u5728\u4e0a\u65b9\u7c98\u8d34 GitHub \u94fe\u63a5\u5f00\u59cb\u3002$/i, 'Select a repository or paste a URL above to get started'],
  [/^\u9009\u62e9\u8981\u52a0\u5165\u5bf9\u8bdd\u4e0a\u4e0b\u6587\u7684\u6587\u4ef6$/i, 'Select files to add to chat context'],
  [/^(\d+)% \u5bb9\u91cf\u5df2\u4f7f\u7528$/i, '$1% of capacity used'],
  [/^\u5df2\u9009\u62e9 (\d+) \u9879$/i, '$1 items selected'],
];

const attributeNames = ['title', 'placeholder', 'aria-label', 'alt'];

export function getStoredUiLanguage(): UiLanguage {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'en' ? 'en' : 'zh-CN';
}

export function setStoredUiLanguage(language: UiLanguage) {
  localStorage.setItem(STORAGE_KEY, language);
  window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: language }));
}

function translateValue(value: string | null, language: UiLanguage) {
  if (!value) return value;
  const trimmed = value.trim();

  if (language === 'zh-CN') {
    if (exactEnToZh[trimmed]) return value.replace(trimmed, exactEnToZh[trimmed]);
    for (const [pattern, replacement] of partialEnToZh) {
      if (pattern.test(trimmed)) return value.replace(trimmed, trimmed.replace(pattern, replacement));
    }
    return value;
  }

  if (exactZhToEn[trimmed]) return value.replace(trimmed, exactZhToEn[trimmed]);
  for (const [pattern, replacement] of partialZhToEn) {
    if (pattern.test(trimmed)) return value.replace(trimmed, trimmed.replace(pattern, replacement));
  }
  return value;
}

function translateTextNode(node: Text, language: UiLanguage) {
  const current = node.nodeValue;
  const translated = translateValue(current, language);
  if (translated && translated !== current) node.nodeValue = translated;
}

function translateElementAttributes(element: Element, language: UiLanguage) {
  for (const name of attributeNames) {
    if (!element.hasAttribute(name)) continue;
    const current = element.getAttribute(name);
    const translated = translateValue(current, language);
    if (translated && translated !== current) element.setAttribute(name, translated);
  }
}

function translateTree(root: ParentNode, language: UiLanguage) {
  if (root instanceof Element) translateElementAttributes(root, language);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      translateTextNode(current as Text, language);
    } else if (current.nodeType === Node.ELEMENT_NODE) {
      translateElementAttributes(current as Element, language);
    }
    current = walker.nextNode();
  }
}

export function useClientLanguageText() {
  const [language, setLanguage] = useState<UiLanguage>(() => getStoredUiLanguage());

  useEffect(() => {
    const onLanguageChanged = (event: Event) => {
      const next = (event as CustomEvent<UiLanguage>).detail || getStoredUiLanguage();
      setLanguage(next);
    };

    window.addEventListener(LANGUAGE_EVENT, onLanguageChanged as EventListener);
    return () => window.removeEventListener(LANGUAGE_EVENT, onLanguageChanged as EventListener);
  }, []);

  const docLanguage = useMemo(() => (language === 'zh-CN' ? 'zh-CN' : 'en'), [language]);

  useEffect(() => {
    document.documentElement.lang = docLanguage;
    translateTree(document.body, language);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
          translateTextNode(mutation.target as Text, language);
        }
        for (const node of Array.from(mutation.addedNodes)) {
          if (node.nodeType === Node.TEXT_NODE) {
            translateTextNode(node as Text, language);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            translateTree(node as Element, language);
          }
        }
        if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) {
          translateElementAttributes(mutation.target as Element, language);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: attributeNames,
    });

    const interval = window.setInterval(() => translateTree(document.body, language), 1200);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, [docLanguage, language]);

  return language;
}

export const useChineseClientText = useClientLanguageText;
