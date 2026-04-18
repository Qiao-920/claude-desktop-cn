import { useEffect } from 'react';

const exactText: Record<string, string> = {
  'New chat': '\u65b0\u5efa\u804a\u5929',
  'New Chat': '\u65b0\u5efa\u804a\u5929',
  'New Conversation': '\u65b0\u5bf9\u8bdd',
  'Search': '\u641c\u7d22',
  'Customize': '\u81ea\u5b9a\u4e49',
  'Chats': '\u804a\u5929',
  'Projects': '\u9879\u76ee',
  'Artifacts': '\u4f5c\u54c1',
  'Recents': '\u6700\u8fd1',
  'Show': '\u663e\u793a',
  'Hide': '\u9690\u85cf',
  'All chats': '\u5168\u90e8\u804a\u5929',
  'User': '\u7528\u6237',
  'Self-hosted': '\u81ea\u6258\u7ba1',
  'Free plan': '\u514d\u8d39\u8ba1\u5212',
  'Rename chat': '\u91cd\u547d\u540d\u804a\u5929',
  'Cancel': '\u53d6\u6d88',
  'Save': '\u4fdd\u5b58',
  'Menu': '\u83dc\u5355',
  'Expand sidebar': '\u5c55\u5f00\u4fa7\u8fb9\u680f',
  'Collapse sidebar': '\u6536\u8d77\u4fa7\u8fb9\u680f',
  'Back': '\u540e\u9000',
  'Forward': '\u524d\u8fdb',
  'Chat': '\u804a\u5929',
  'Cowork': '\u534f\u4f5c',
  'Code': '\u4ee3\u7801',
  'Star': '\u6536\u85cf',
  'Rename': '\u91cd\u547d\u540d',
  'Delete': '\u5220\u9664',
  'View Artifacts': '\u67e5\u770b\u4f5c\u54c1',
  'Open Workspace Folder': '\u6253\u5f00\u5de5\u4f5c\u533a\u6587\u4ef6\u5939',
  'Settings': '\u8bbe\u7f6e',
  'Help': '\u5e2e\u52a9',
  'Get Help': '\u552e\u540e\u652f\u6301',
  'Log out': '\u9000\u51fa\u767b\u5f55',
  'Logout': '\u9000\u51fa\u767b\u5f55',
  'Admin': '\u7ba1\u7406\u540e\u53f0',
  'Admin Panel': '\u7ba1\u7406\u9762\u677f',
  'Upgrade': '\u5347\u7ea7',
  'Payment': '\u5957\u9910\u8d2d\u4e70',
  'Login': '\u767b\u5f55',
  'Register': '\u6ce8\u518c',
  'Email': '\u90ae\u7bb1',
  'Password': '\u5bc6\u7801',
  'Provider': '\u670d\u52a1\u5546',
  'Providers': '\u670d\u52a1\u5546',
  'Models': '\u6a21\u578b',
  'Upload': '\u4e0a\u4f20',
  'Send': '\u53d1\u9001',
  'Continue': '\u7ee7\u7eed',
  'Start': '\u5f00\u59cb',
  'Import': '\u5bfc\u5165',
  'Export': '\u5bfc\u51fa',
  'Downloading update...': '\u6b63\u5728\u4e0b\u8f7d\u66f4\u65b0...',
  'Relaunch to apply': '\u91cd\u542f\u540e\u751f\u6548',
  'Relaunch': '\u91cd\u542f',
  'Skill': '\u6280\u80fd',
  'Add content from GitHub': '\u4ece GitHub \u6dfb\u52a0\u5185\u5bb9',
  'Select a repository': '\u9009\u62e9\u4ed3\u5e93',
  'Open': '\u6253\u5f00',
  'Connect GitHub': '\u8fde\u63a5 GitHub',
  'Waiting for GitHub...': '\u7b49\u5f85 GitHub \u6388\u6743...',
  'Loading repositories...': '\u6b63\u5728\u52a0\u8f7d\u4ed3\u5e93...',
  'No repositories found': '\u672a\u627e\u5230\u4ed3\u5e93',
  'Loading...': '\u52a0\u8f7d\u4e2d...',
  'Empty folder': '\u7a7a\u6587\u4ef6\u5939',
  'Add to chat': '\u6dfb\u52a0\u5230\u5bf9\u8bdd',
};

const partialText: Array<[RegExp, string]> = [
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
  [/^Select the files you would like to add to this chat$/i, '\u9009\u62e9\u4f60\u60f3\u52a0\u5165\u5f53\u524d\u5bf9\u8bdd\u7684\u6587\u4ef6'],
  [/^Connect your GitHub account to browse repositories\.$/i, '\u8fde\u63a5\u4f60\u7684 GitHub \u8d26\u53f7\u540e\u5373\u53ef\u6d4f\u89c8\u4ed3\u5e93\u3002'],
  [/^Select a repository or paste a URL above to get started$/i, '\u9009\u62e9\u4e00\u4e2a\u4ed3\u5e93\uff0c\u6216\u5728\u4e0a\u65b9\u7c98\u8d34 GitHub \u94fe\u63a5\u5f00\u59cb\u3002'],
  [/^Select files to add to chat context$/i, '\u9009\u62e9\u8981\u52a0\u5165\u5bf9\u8bdd\u4e0a\u4e0b\u6587\u7684\u6587\u4ef6'],
  [/^(\d+)% of capacity used$/i, '$1% \u5bb9\u91cf\u5df2\u4f7f\u7528'],
  [/^(\d+) item selected$/i, '\u5df2\u9009\u62e9 $1 \u9879'],
  [/^(\d+) items selected$/i, '\u5df2\u9009\u62e9 $1 \u9879'],
];

const attributeNames = ['title', 'placeholder', 'aria-label', 'alt'];

function translateValue(value: string | null) {
  if (!value) return value;
  const trimmed = value.trim();
  if (exactText[trimmed]) return value.replace(trimmed, exactText[trimmed]);
  for (const [pattern, replacement] of partialText) {
    if (pattern.test(trimmed)) return value.replace(trimmed, trimmed.replace(pattern, replacement));
  }
  return value;
}

function translateTextNode(node: Text) {
  const current = node.nodeValue;
  const translated = translateValue(current);
  if (translated && translated !== current) node.nodeValue = translated;
}

function translateElementAttributes(element: Element) {
  for (const name of attributeNames) {
    if (!element.hasAttribute(name)) continue;
    const current = element.getAttribute(name);
    const translated = translateValue(current);
    if (translated && translated !== current) element.setAttribute(name, translated);
  }
}

function translateTree(root: ParentNode) {
  if (root instanceof Element) translateElementAttributes(root);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      translateTextNode(current as Text);
    } else if (current.nodeType === Node.ELEMENT_NODE) {
      translateElementAttributes(current as Element);
    }
    current = walker.nextNode();
  }
}

export function useChineseClientText() {
  useEffect(() => {
    document.documentElement.lang = 'zh-CN';
    translateTree(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
          translateTextNode(mutation.target as Text);
        }
        for (const node of Array.from(mutation.addedNodes)) {
          if (node.nodeType === Node.TEXT_NODE) {
            translateTextNode(node as Text);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            translateTree(node as Element);
          }
        }
        if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) {
          translateElementAttributes(mutation.target as Element);
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

    return () => observer.disconnect();
  }, []);
}
