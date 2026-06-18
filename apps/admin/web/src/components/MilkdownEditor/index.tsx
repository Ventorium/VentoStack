/**
 * Milkdown Markdown 编辑器组件
 * 基于 Crepe 编辑器
 */
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { theme as antTheme, Spin } from "antd";

export interface MilkdownEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}

export default function MilkdownEditor({ value, onChange, readOnly = false }: MilkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const [ready, setReady] = useState(false);
  const { token } = antTheme.useToken();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastExternalValue = useRef(value);

  useEffect(() => {
    if (!containerRef.current || crepeRef.current) return;

    const crepe = new Crepe({
      root: containerRef.current,
      defaultValue: value,
    });

    if (readOnly) crepe.setReadonly(true);

    crepe.create().then(() => {
      crepeRef.current = crepe;
      setReady(true);

      // 轮询检测内容变化
      let lastMd = value;
      const interval = setInterval(() => {
        if (!crepeRef.current) return;
        try {
          const md = crepeRef.current.getMarkdown();
          if (md !== lastMd) {
            lastMd = md;
            lastExternalValue.current = md;
            onChangeRef.current?.(md);
          }
        } catch { /* ignore */ }
      }, 300);

      // 存储 interval 到 crepe 对象以便清理
      (crepe as unknown as { _interval: ReturnType<typeof setInterval> })._interval = interval;
    });

    return () => {
      const c = crepeRef.current as unknown as { _interval?: ReturnType<typeof setInterval> } | null;
      if (c?._interval) clearInterval(c._interval);
      crepeRef.current?.destroy();
      crepeRef.current = null;
      setReady(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 外部 value 变化时同步
  useEffect(() => {
    if (!crepeRef.current || !ready) return;
    if (value === lastExternalValue.current) return;
    lastExternalValue.current = value;
    // 通过 editor view 更新
    try {
      const editor = crepeRef.current.editor;
      const view = editor.get(editorCtx).view;
      const parser = editor.get(parserCtx);
      if (view && parser) {
        const doc = parser(value);
        if (doc) {
          view.dispatch(view.state.tr.replace(0, view.state.doc.content.size).insert(0, doc.content));
        }
      }
    } catch { /* ignore */ }
  }, [value, ready]);

  return (
    <div className="relative">
      {!ready && <Spin className="block" style={{ margin: "40px auto" }} />}
      <div
        ref={containerRef}
        className="min-h-[300px]" style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, opacity: ready ? 1 : 0, transition: "opacity 0.2s" }}
      />
    </div>
  );
}

import { editorCtx, parserCtx } from "@milkdown/core";
