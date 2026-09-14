import { client } from '@/api';
import type { CacheStatus, DataSourceStatus, HealthStatus, ServerStatus } from '@/api/types';
import { ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Col, Progress, Row, Space, Spin, Statistic, Tag } from 'antd';
import { useCallback, useEffect, useState } from 'react';

const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}天 ${hours}小时 ${minutes}分钟`;
};

const asPercent = (ratio: number): number =>
  Math.round(Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0)) * 100);

const metricUnavailable = <Tag color="default">暂不支持采集</Tag>;

const MonitorPage = () => {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(false);

  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [dataSourceStatus, setDataSourceStatus] = useState<DataSourceStatus | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [serverRes, cacheRes, dsRes, healthRes] = await Promise.all([
        client.get('/api/system/monitor/server'),
        client.get('/api/system/monitor/cache'),
        client.get('/api/system/monitor/datasource'),
        client.get('/api/system/monitor/health'),
      ]);
      if (!serverRes?.error && serverRes?.data) setServerStatus(serverRes.data as ServerStatus);
      if (!cacheRes?.error && cacheRes?.data) setCacheStatus(cacheRes.data as CacheStatus);
      if (!dsRes?.error && dsRes?.data) setDataSourceStatus(dsRes.data as DataSourceStatus);
      if (!healthRes?.error && healthRes?.data) setHealthStatus(healthRes.data as HealthStatus);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchAllData, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAllData]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">系统监控</h3>
        <Space>
          <Button loading={loading} icon={<ReloadOutlined />} onClick={fetchAllData}>
            刷新
          </Button>
          <Button
            type={autoRefresh ? 'primary' : 'default'}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? '自动刷新：开' : '自动刷新：关'}
          </Button>
        </Space>
      </div>

      <Spin spinning={loading}>
        <Row gutter={[16, 16]} className="mb-4">
          <Col xs={24} sm={12} xl={6}>
            <Card title="服务器状态" size="small">
              {serverStatus ? (
                <Space orientation="vertical" className="w-full">
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">CPU使用率</div>
                    {serverStatus.cpu.available ? (
                      <Progress percent={asPercent(serverStatus.cpu.usage)} size="small" />
                    ) : (
                      metricUnavailable
                    )}
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {serverStatus.cpu.model} ({serverStatus.cpu.cores} cores)
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">内存使用率</div>
                    {serverStatus.memory.available ? (
                      <>
                        <Progress percent={asPercent(serverStatus.memory.usage)} size="small" />
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {Math.round(serverStatus.memory.used / 1024 / 1024)} MB /{' '}
                          {Math.round(serverStatus.memory.total / 1024 / 1024)} MB
                        </div>
                      </>
                    ) : (
                      metricUnavailable
                    )}
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">磁盘使用率</div>
                    {serverStatus.disk.available ? (
                      <>
                        <Progress percent={asPercent(serverStatus.disk.usage)} size="small" />
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {Math.round(serverStatus.disk.used / 1024 / 1024 / 1024)} GB /{' '}
                          {Math.round(serverStatus.disk.total / 1024 / 1024 / 1024)} GB
                          {' · '}
                          {serverStatus.disk.mount}
                        </div>
                      </>
                    ) : (
                      metricUnavailable
                    )}
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                      应用运行时间
                    </div>
                    <div className="text-base font-medium">
                      {formatUptime(serverStatus.process.uptime)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">运行时版本</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Bun: {serverStatus.process.bunVersion}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Node 兼容层: {serverStatus.process.nodeCompatibilityVersion}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">
                    采集时间: {new Date(serverStatus.collectedAt).toLocaleString()}
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">系统信息</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {serverStatus.os.platform} / {serverStatus.os.arch}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      主机名: {serverStatus.os.hostname}
                    </div>
                  </div>
                </Space>
              ) : (
                <div className="text-center text-gray-400 dark:text-gray-500 py-4">暂无数据</div>
              )}
            </Card>
          </Col>

          <Col xs={24} sm={12} xl={6}>
            <Card title="缓存状态" size="small">
              {cacheStatus?.available ? (
                <Space orientation="vertical" className="w-full">
                  <Statistic title="键数量" value={cacheStatus.keyCount} />
                  {cacheStatus.hitRate != null && (
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">命中率</div>
                      <Progress percent={asPercent(cacheStatus.hitRate)} size="small" />
                    </div>
                  )}
                  <Statistic title="内存使用" value={cacheStatus.memory} />
                  {cacheStatus.version && (
                    <Statistic title="Redis 版本" value={cacheStatus.version} />
                  )}
                </Space>
              ) : cacheStatus ? (
                <div className="text-center py-4">{metricUnavailable}</div>
              ) : (
                <div className="text-center text-gray-400 dark:text-gray-500 py-4">暂无数据</div>
              )}
            </Card>
          </Col>

          <Col xs={24} sm={12} xl={6}>
            <Card title="数据源状态" size="small">
              {dataSourceStatus ? (
                <Space orientation="vertical" className="w-full">
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">连接状态</div>
                    <Tag color={dataSourceStatus.connected ? 'green' : 'red'}>
                      {dataSourceStatus.connected ? '已连接' : '未连接'}
                    </Tag>
                  </div>
                  {dataSourceStatus.metricsAvailable ? (
                    <>
                      <Statistic title="连接池大小" value={dataSourceStatus.poolSize} />
                      <Statistic title="活跃连接" value={dataSourceStatus.activeConnections} />
                      <Statistic title="空闲连接" value={dataSourceStatus.idleConnections} />
                    </>
                  ) : (
                    metricUnavailable
                  )}
                </Space>
              ) : (
                <div className="text-center text-gray-400 dark:text-gray-500 py-4">暂无数据</div>
              )}
            </Card>
          </Col>

          <Col xs={24} sm={12} xl={6}>
            <Card title="健康检查" size="small">
              {healthStatus ? (
                <Space orientation="vertical" className="w-full">
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">总体状态</div>
                    <Tag
                      color={
                        healthStatus.status === 'UP'
                          ? 'green'
                          : healthStatus.status === 'DEGRADED'
                            ? 'orange'
                            : 'red'
                      }
                    >
                      {healthStatus.status}
                    </Tag>
                  </div>
                  <div className="mt-2">
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">检查项</div>
                    {healthStatus.checks.map((check) => (
                      <div key={check.name} className="flex justify-between items-center py-1">
                        <span className="text-xs">{check.name}</span>
                        <Tag
                          color={check.status === 'UP' ? 'green' : 'red'}
                          className="text-[10px]"
                        >
                          {check.status}
                        </Tag>
                      </div>
                    ))}
                  </div>
                </Space>
              ) : (
                <div className="text-center text-gray-400 dark:text-gray-500 py-4">暂无数据</div>
              )}
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  );
};

export default MonitorPage;
