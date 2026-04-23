/**
 * Builds a self-contained HTML document from artifact content.
 * Supports two types:
 * - "application/vnd.ant.react" → React component wrapped with CDN deps
 * - "text/html" → Raw HTML document
 */
export function buildArtifactHtml(content: string, type: string): string {
  if (type === 'text/html') {
    if (!content.includes('<html')) {
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif}</style></head><body>${content}${buildPreviewRuntime()}</body></html>`;
    }
    return injectPreviewRuntime(content);
  }

  // React component — preprocess and wrap
  const processed = preprocessReactCode(content);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin><\/script>
<script src="https://unpkg.com/@babel/standalone@7/babel.min.js"><\/script>
<script src="https://cdn.tailwindcss.com/3.4.1"><\/script>
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"><\/script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
${buildPreviewRuntimeSource()}
// Shim React hooks as globals for convenience
const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, createContext, Fragment, forwardRef, memo, lazy, Suspense } = React;

// Build React components from real lucide icon SVG data
// lucide CDN provides window.lucide.icons = { 'icon-name': [tag, attrs, children], ... }
var _iconCache = {};
var _iconFactory = function(name) {
  if (_iconCache[name]) return _iconCache[name];
  var comp = function LucideIcon(props) {
    props = props || {};
    var size = props.size || 24;
    var color = props.color || 'currentColor';
    var sw = props.strokeWidth || 2;
    var cn = props.className || '';
    // Look up real icon data from lucide (PascalCase keys, e.g. "Sparkles")
    // Data format: [[tag, attrs], [tag, attrs], ...]
    var iconData = window.lucide && window.lucide.icons && window.lucide.icons[name];
    var children = [];
    if (iconData) {
      children = iconData.map(function(el, i) {
        return React.createElement(el[0], Object.assign({key: i}, el[1]));
      });
    }
    return React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 24 24',
      fill: props.fill || 'none', stroke: color, strokeWidth: sw,
      strokeLinecap: 'round', strokeLinejoin: 'round',
      className: cn, style: props.style, onClick: props.onClick
    }, children);
  };
  _iconCache[name] = comp;
  return comp;
};
window._iconFactory = _iconFactory;

// Mock recharts (some artifacts use it)
var _chartMock = function(props) { return React.createElement('div', {style:{width:props.width||'100%',height:props.height||300,background:'#f5f5f5',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',color:'#999',fontSize:14}}, 'Chart: ' + (props.data ? props.data.length + ' items' : 'no data')); };
var _passThroughMock = function(props) { return React.createElement(React.Fragment, null, props.children); };
window.ResponsiveContainer = _passThroughMock;
window.LineChart = _chartMock; window.BarChart = _chartMock; window.PieChart = _chartMock; window.AreaChart = _chartMock;
window.Line = function(){return null}; window.Bar = function(){return null}; window.Pie = function(){return null}; window.Area = function(){return null};
window.XAxis = function(){return null}; window.YAxis = function(){return null}; window.CartesianGrid = function(){return null};
window.Tooltip = function(){return null}; window.Legend = function(){return null}; window.Cell = function(){return null};

// Mock window.claude API (many artifacts use this)
window.claude = {
  complete: async function(opts) {
    return { content: [{ text: "This artifact requires the Claude API to function. Click 'Customize' to try it in a new conversation." }] };
  }
};

${processed.code}

// Render the component
try {
  const _Component = ${processed.componentName};
  const _root = ReactDOM.createRoot(document.getElementById('root'));
  _root.render(React.createElement(_Component));
  window.__claudePreviewReady && window.__claudePreviewReady();
} catch(e) {
  document.getElementById('root').innerHTML = '<div style="padding:24px;color:#e44;font-family:monospace;font-size:13px"><b>Render error:</b><br>' + e.message + '</div>';
  window.__claudePreviewError && window.__claudePreviewError(e);
  console.error('Artifact render error:', e);
}
<\/script>
</body>
</html>`;
}

function buildPreviewRuntimeSource(): string {
  return `
window.__claudePreviewPost = function(payload) {
  try {
    parent.postMessage(Object.assign({ source: 'claude-desktop-cn-artifact-preview' }, payload), '*');
  } catch (_) {}
};
window.__claudePreviewReady = function() {
  window.__claudePreviewPost({
    type: 'ready',
    textLength: (document.body && document.body.innerText || '').trim().length,
    height: document.documentElement ? document.documentElement.scrollHeight : 0
  });
};
window.__claudePreviewError = function(error) {
  window.__claudePreviewPost({
    type: 'error',
    message: error && error.message ? error.message : String(error || 'Unknown preview error'),
    stack: error && error.stack ? error.stack : ''
  });
};
window.__claudePreviewIssue = function(payload) {
  window.__claudePreviewPost(Object.assign({
    type: 'issue',
    severity: 'warning'
  }, payload || {}));
};
(function() {
  var levels = ['log', 'info', 'warn', 'error'];
  levels.forEach(function(level) {
    var original = console[level];
    console[level] = function() {
      var message = Array.prototype.slice.call(arguments).map(function(item) {
        if (item instanceof Error) return item.message;
        if (typeof item === 'object') {
          try {
            return JSON.stringify(item);
          } catch (_) {
            return String(item);
          }
        }
        return String(item);
      }).join(' ');
      window.__claudePreviewPost({ type: 'console', level: level, message: message });
      if (original) return original.apply(console, arguments);
    };
  });
})();
window.addEventListener('error', function(event) {
  window.__claudePreviewError(event.error || event.message);
});
window.addEventListener('unhandledrejection', function(event) {
  window.__claudePreviewError(event.reason || 'Unhandled promise rejection');
});
window.addEventListener('error', function(event) {
  var target = event && event.target;
  if (!target || target === window) return;
  var tagName = target.tagName || 'resource';
  var source = target.currentSrc || target.src || target.href || '';
  window.__claudePreviewIssue({
    message: 'Failed to load ' + tagName.toLowerCase() + (source ? ': ' + source : ''),
    severity: tagName === 'SCRIPT' ? 'error' : 'warning',
    source: source,
    resourceType: tagName.toLowerCase()
  });
}, true);
(function() {
  if (typeof window.fetch !== 'function') return;
  var originalFetch = window.fetch.bind(window);
  window.fetch = function() {
    var input = arguments[0];
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    return originalFetch.apply(window, arguments).then(function(response) {
      if (!response.ok) {
        window.__claudePreviewIssue({
          message: 'Request failed with ' + response.status + (url ? ': ' + url : ''),
          severity: response.status >= 500 ? 'error' : 'warning',
          source: url,
          resourceType: 'fetch'
        });
      }
      return response;
    }).catch(function(error) {
      window.__claudePreviewIssue({
        message: error && error.message ? error.message : 'Fetch failed',
        severity: 'error',
        source: url,
        resourceType: 'fetch'
      });
      throw error;
    });
  };
})();
window.addEventListener('load', function() {
  window.setTimeout(window.__claudePreviewReady, 80);
  window.setTimeout(function() {
    var text = (document.body && document.body.innerText || '').trim();
    var hasVisibleElement = document.body && Array.from(document.body.children || []).some(function(el) {
      var rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (!text && !hasVisibleElement) {
      window.__claudePreviewPost({ type: 'empty', message: 'Preview loaded but no visible content was detected.' });
    }
  }, 900);
});
`;
}

function buildPreviewRuntime(): string {
  return `<script>${buildPreviewRuntimeSource()}<\/script>`;
}

function injectPreviewRuntime(html: string): string {
  const runtime = buildPreviewRuntime();
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${runtime}</body>`);
  }
  return `${html}${runtime}`;
}

/**
 * Preprocesses React artifact code:
 * - Strips import statements (React/lucide-react/recharts are available as globals)
 * - Strips export default
 * - Detects the main component name
 */
function preprocessReactCode(code: string): { code: string; componentName: string } {
  const lines = code.split('\n');
  const outputLines: string[] = [];
  let componentName = 'App';
  let inImportBlock = false;
  let importBlockBuffer = '';
  const importedNames: string[] = []; // Track all imported names from non-react libs

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Collect import statements (single or multi-line) and extract named imports
    if (trimmed.startsWith('import ') || inImportBlock) {
      if (!inImportBlock && trimmed.startsWith('import ')) {
        importBlockBuffer = trimmed;
        if (trimmed.includes('{') && !trimmed.includes('}')) {
          inImportBlock = true;
          continue;
        }
      } else if (inImportBlock) {
        importBlockBuffer += ' ' + trimmed;
        if (!trimmed.includes('}')) continue;
        inImportBlock = false;
      }

      // Extract named imports: import { Foo, Bar } from 'xxx'
      const namedMatch = importBlockBuffer.match(/\{([^}]+)\}/);
      if (namedMatch) {
        const names = namedMatch[1].split(',').map(n => {
          const parts = n.trim().split(/\s+as\s+/);
          return (parts[1] || parts[0]).trim();
        }).filter(n => n && /^[A-Z]/.test(n));
        importedNames.push(...names);
      }
      importBlockBuffer = '';
      continue;
    }

    // Detect and strip "export default ComponentName"
    const exportMatch = trimmed.match(/^export\s+default\s+(\w+)\s*;?\s*$/);
    if (exportMatch) {
      componentName = exportMatch[1];
      continue;
    }

    // Detect "export default function ComponentName" or "export default class ComponentName"
    const exportFuncMatch = trimmed.match(/^export\s+default\s+(function|class)\s+(\w+)/);
    if (exportFuncMatch) {
      componentName = exportFuncMatch[2];
      outputLines.push(lines[i].replace(/export\s+default\s+/, ''));
      continue;
    }

    // Strip "export " from "export const/function/class"
    if (trimmed.startsWith('export ') && !trimmed.startsWith('export default')) {
      outputLines.push(lines[i].replace(/export\s+/, ''));
      continue;
    }

    outputLines.push(lines[i]);
  }

  // Generate icon stubs for all imported PascalCase names that aren't React built-ins
  const reactBuiltins = new Set(['React', 'Component', 'PureComponent', 'Fragment', 'Suspense', 'StrictMode']);
  const iconStubs = importedNames
    .filter(n => !reactBuiltins.has(n))
    .map(n => `if (typeof ${n} === 'undefined') { var ${n} = window._iconFactory('${n}'); }`)
    .join('\n');

  const finalCode = iconStubs + '\n' + outputLines.join('\n');

  // If no export default was found, try to detect the component from common patterns
  if (componentName === 'App') {
    const funcMatch = code.match(/(?:const|function)\s+([A-Z]\w+)\s*[=(]/);
    if (funcMatch) {
      // Find the LAST capitalized function/const (usually the main component)
      const allMatches = [...code.matchAll(/(?:const|function)\s+([A-Z]\w+)\s*[=(]/g)];
      if (allMatches.length > 0) {
        componentName = allMatches[allMatches.length - 1][1];
      }
    }
  }

  return { code: finalCode, componentName };
}

/**
 * Fetches artifact code from public folder by code_file name.
 */
export async function loadArtifactCode(codeFile: string): Promise<{ content: string; type: string; title: string } | null> {
  try {
    const res = await fetch(`./artifacts/code/${codeFile}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      content: data.content || '',
      type: data.type || 'text/html',
      title: data.title || '',
    };
  } catch {
    return null;
  }
}
