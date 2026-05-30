import { useDict } from "@/hooks/useDict";
import type { RadioGroupProps } from "antd";
import { Radio, Spin } from "antd";

export interface DictRadioProps extends Omit<RadioGroupProps, "options" | "loading"> {
  typeCode: string;
  autoload?: boolean;
}

const DictRadio = ({ typeCode, autoload = true, ...rest }: DictRadioProps) => {
  const { options, loading } = useDict(autoload ? typeCode : "__none__");

  const radioOptions = (options ?? []).map((item) => ({
    label: item.label,
    value: item.value,
  }));

  if (loading) return <Spin size="small" />;

  return <Radio.Group {...rest} options={radioOptions} />;
};

export default DictRadio;
