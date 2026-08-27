/** JSON 折叠展示：键值树形渲染，长文本/大对象默认折叠 */
import { useState } from "react";
import { Empty, Typography } from "antd";

function renderValue(value: unknown, keyPrefix: string): React.ReactNode {
  if (value === null) return <Typography.Text type="secondary">null</Typography.Text>;
  if (typeof value === "boolean") {
    return <Typography.Text code>{String(value)}</Typography.Text>;
  }
  if (typeof value === "number") {
    return <Typography.Text code>{String(value)}</Typography.Text>;
  }
  if (typeof value === "string") {
    const isLong = value.length > 120;
    if (isLong) {
      return <LongText text={value} />;
    }
    return <Typography.Text>{value}</Typography.Text>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <Typography.Text type="secondary">[]</Typography.Text>;
    return (
      <ul className="m-0 list-none p-0 pl-4">
        {value.map((item, i) => (
          <li key={`${keyPrefix}-${i}`} className="py-0.5">
            {renderValue(item, `${keyPrefix}-${i}`)}
          </li>
        ))}
      </ul>
    );
  }
  // object
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return <Typography.Text type="secondary">{"{}"}</Typography.Text>;
  return (
    <ul className="m-0 list-none p-0 pl-4">
      {entries.map(([k, v]) => (
        <li key={`${keyPrefix}-${k}`} className="py-0.5">
          <Typography.Text type="secondary" className="mr-1">{k}:</Typography.Text>
          {renderValue(v, `${keyPrefix}-${k}`)}
        </li>
      ))}
    </ul>
  );
}

/** 超长字符串：默认折叠，点击展开 */
const LONG_TEXT_PREVIEW = 300;

function LongText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = text.length > LONG_TEXT_PREVIEW;
  const shown = expanded || !preview ? text : `${text.slice(0, LONG_TEXT_PREVIEW)}…`;
  return (
    <span className="whitespace-pre-wrap break-all">
      {shown}
      {preview && (
        <Typography.Link className="ml-1 text-xs" onClick={() => setExpanded(!expanded)}>
          {expanded ? "收起" : "展开全部"}
        </Typography.Link>
      )}
    </span>
  );
}

export default function JsonView({ value, emptyHint }: { value: unknown; emptyHint?: string }) {
  if (value === null || value === undefined) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyHint ?? "无数据"} />;
  }
  return <div className="text-xs leading-5">{renderValue(value, "json")}</div>;
}
