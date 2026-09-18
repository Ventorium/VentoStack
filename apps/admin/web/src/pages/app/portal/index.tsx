import { oauthApi } from '@/api/oauth';
import type { OAuthPortalApplication } from '@/api/types';
import { AppstoreOutlined, SearchOutlined } from '@ant-design/icons';
import { Avatar, Card, Empty, Input, Skeleton, Typography } from 'antd';
import { useEffect, useState } from 'react';

const { Paragraph, Text } = Typography;

export default function ApplicationPortalPage() {
  const [applications, setApplications] = useState<OAuthPortalApplication[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      oauthApi
        .portal(search.trim())
        .then((result) => {
          if (!result.error) setApplications(result.data ?? []);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold m-0">应用门户</h3>
          <Text type="secondary">选择您有权访问的业务系统</Text>
        </div>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索应用"
          className="max-w-80"
        />
      </div>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((key) => (
            <Card key={key}>
              <Skeleton active avatar paragraph={{ rows: 2 }} />
            </Card>
          ))}
        </div>
      ) : applications.length === 0 ? (
        <Card>
          <Empty description="暂无可访问应用" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {applications.map((application) => (
            <Card
              key={application.id}
              hoverable
              onClick={() => window.open(application.homepageUrl, '_blank', 'noopener,noreferrer')}
              className="cursor-pointer min-h-38"
            >
              <div className="flex gap-4">
                <Avatar
                  shape="square"
                  size={52}
                  src={application.iconUrl || undefined}
                  icon={!application.iconUrl ? <AppstoreOutlined /> : undefined}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-base truncate">{application.name}</div>
                  <Text type="secondary" className="text-xs">
                    {new URL(application.homepageUrl).host}
                  </Text>
                  <Paragraph type="secondary" ellipsis={{ rows: 2 }} className="mt-3 mb-0">
                    {application.description || '暂无描述'}
                  </Paragraph>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
