import { HomeOutlined } from "@ant-design/icons";
import { Button, Result } from "antd";
import { useNavigate } from "react-router-dom";

const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-neutral-900">
      <Result
        status="404"
        title="404"
        subTitle="抱歉，您访问的页面不存在"
        extra={
          <Button type="primary" icon={<HomeOutlined />} onClick={() => navigate("/", { replace: true })}>
            返回首页
          </Button>
        }
      />
    </div>
  );
};

export default NotFoundPage;
