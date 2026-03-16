import { useEffect, useState } from "react";
import {
  Card, Statistic, Row, Col, Tag, Table, Progress, Button, Avatar,
  Typography, Spin, App, Empty, Tooltip, Badge, Flex, Space, Divider,
} from "antd";
import {
  ReloadOutlined, ClockCircleOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, UserOutlined, ThunderboltOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { DashboardSnapshot, MemberStats, FlaggedIssue, StatusType } from "../types";
import { fetchDashboard, refreshSnapshot } from "../api";

const { Text, Title } = Typography;

const statusColors: Record<StatusType, string> = {
  triage: "purple",
  backlog: "default",
  unstarted: "default",
  started: "processing",
  completed: "success",
  cancelled: "error",
};

const statusLabels: Record<StatusType, string> = {
  triage: "Triage",
  backlog: "Backlog",
  unstarted: "Todo",
  started: "In Progress",
  completed: "Done",
  cancelled: "Cancelled",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface WeekBucket {
  label: string;       // e.g. "10 Mar"
  points: number;
  isCurrent: boolean;
}

function computeWeeklyVelocity(issues: DashboardSnapshot["by_status"]["completed"]["issues"], weeks = 8): WeekBucket[] {
  // Build week boundaries (Monday 00:00 UTC)
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const thisMonday = new Date(now);
  thisMonday.setUTCDate(thisMonday.getUTCDate() - diff);
  thisMonday.setUTCHours(0, 0, 0, 0);

  const buckets: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisMonday);
    start.setUTCDate(start.getUTCDate() - i * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);

    const pts = issues
      .filter((iss) => {
        if (!iss.completed_at) return false;
        const d = new Date(iss.completed_at);
        return d >= start && d < end;
      })
      .reduce((sum, iss) => sum + (iss.estimate ?? 0), 0);

    buckets.push({
      label: start.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      points: pts,
      isCurrent: i === 0,
    });
  }

  return buckets;
}

function VelocityChart({ snapshot }: { snapshot: DashboardSnapshot }) {
  const completed = snapshot.by_status.completed?.issues ?? [];
  const buckets = computeWeeklyVelocity(completed);
  const maxPts = Math.max(...buckets.map((b) => b.points), 1);
  const avg = buckets.length > 1
    ? Math.round(buckets.slice(0, -1).reduce((s, b) => s + b.points, 0) / (buckets.length - 1))
    : 0;

  return (
    <Card bordered style={{ marginBottom: 24 }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <Text strong>Weekly Velocity</Text>
        {avg > 0 && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            avg {avg} pts / week
          </Text>
        )}
      </Flex>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140 }}>
        {buckets.map((b) => {
          const barHeight = maxPts > 0 ? Math.max(Math.round((b.points / maxPts) * 100), b.points > 0 ? 6 : 2) : 2;
          return (
            <Tooltip key={b.label} title={`${b.label}: ${b.points} pts`}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                {b.points > 0 && (
                  <Text style={{ fontSize: 11, marginBottom: 4, color: b.isCurrent ? "#a78bfa" : "#a1a1aa" }}>
                    {b.points}
                  </Text>
                )}
                <div
                  style={{
                    width: "100%",
                    maxWidth: 48,
                    height: barHeight,
                    background: b.isCurrent ? "#a78bfa" : "#3f3f46",
                    borderRadius: 4,
                  }}
                />
                <Text type="secondary" style={{ fontSize: 10, marginTop: 6, whiteSpace: "nowrap" }}>
                  {b.label}
                </Text>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<{ snapshot: DashboardSnapshot; created_at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { message } = App.useApp();

  const load = async () => {
    try {
      const result = await fetchDashboard();
      setData({ snapshot: result.snapshot, created_at: result.created_at });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshSnapshot();
      message.success("Snapshot refreshed");
      await load();
    } catch (err) {
      message.error(String(err));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <Spin style={{ display: "block", margin: "80px auto" }} size="large" />;

  if (!data) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: 400 }}>
        <Empty
          description={<Text type="secondary">No dashboard data yet</Text>}
        >
          <Button type="primary" icon={<ReloadOutlined />} loading={refreshing} onClick={handleRefresh}>
            Generate Snapshot
          </Button>
        </Empty>
      </Flex>
    );
  }

  const { snapshot, created_at } = data;
  const s = snapshot.summary;

  const memberColumns: ColumnsType<MemberStats> = [
    {
      title: "Member",
      dataIndex: "display_name",
      render: (name: string, record: MemberStats) => (
        <Flex align="center" gap={10}>
          <Avatar src={record.avatar_url} icon={<UserOutlined />} size={32} />
          <div>
            <Text strong>{name}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>{record.assigned_count} assigned</Text>
          </div>
        </Flex>
      ),
    },
    {
      title: "Todo",
      dataIndex: "points_todo",
      width: 90,
      align: "center" as const,
      render: (val: number) => val > 0
        ? <Tag bordered={false}>{val} pts</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "In Progress",
      dataIndex: "points_in_progress",
      width: 100,
      align: "center" as const,
      render: (val: number) => val > 0
        ? <Tag color="processing" bordered={false}>{val} pts</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "In Review",
      dataIndex: "points_in_review",
      width: 100,
      align: "center" as const,
      render: (val: number) => val > 0
        ? <Tag color="warning" bordered={false}>{val} pts</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "Blocked",
      dataIndex: "points_blocked",
      width: 90,
      align: "center" as const,
      render: (val: number) => val > 0
        ? <Tag color="error" bordered={false}>{val} pts</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "Completed",
      dataIndex: "points_completed",
      width: 100,
      align: "center" as const,
      render: (val: number) => val > 0
        ? <Tag color="success" bordered={false}>{val} pts</Tag>
        : <Text type="secondary">—</Text>,
    },
  ];

  const flagColumns: ColumnsType<FlaggedIssue> = [
    {
      title: "Issue",
      width: 100,
      render: (_: unknown, record: FlaggedIssue) => (
        <a href={`https://linear.app/issue/${record.issue.identifier}`} target="_blank" rel="noopener noreferrer">
          <Typography.Text code style={{ fontSize: 12, color: "#a78bfa" }}>{record.issue.identifier}</Typography.Text>
        </a>
      ),
    },
    {
      title: "Summary",
      render: (_: unknown, record: FlaggedIssue) => (
        <a href={`https://linear.app/issue/${record.issue.identifier}`} target="_blank" rel="noopener noreferrer">
          <Text style={{ color: "#fafafa" }}>{record.issue.title}</Text>
        </a>
      ),
    },
    {
      title: "Assignee",
      width: 180,
      render: (_: unknown, record: FlaggedIssue) => record.issue.assignee_name
        ? <Text>{record.issue.assignee_name}</Text>
        : <Text type="secondary">Unassigned</Text>,
    },
    {
      title: "Reason",
      dataIndex: "reason",
      width: 200,
      render: (val: string) => <Text type="secondary" style={{ fontSize: 12 }}>{val}</Text>,
    },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <Flex justify="space-between" align="center" style={{ marginBottom: 28 }}>
        <div>
          <Title level={3} style={{ margin: 0, letterSpacing: "-0.025em" }}>{snapshot.team_name}</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Updated {timeAgo(created_at)} · {new Date(snapshot.generated_at).toLocaleString("en-GB")}
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} loading={refreshing} onClick={handleRefresh}>
          Refresh
        </Button>
      </Flex>

      {/* Summary stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card bordered>
            <Statistic
              title="Completed This Week"
              value={s.points_completed}
              suffix="pts"
              prefix={<CheckCircleOutlined style={{ fontSize: 16 }} />}
              valueStyle={{ color: "#4ade80" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered>
            <Statistic
              title="In Progress"
              value={s.points_in_progress}
              suffix="pts"
              prefix={<ThunderboltOutlined style={{ fontSize: 16 }} />}
              valueStyle={{ color: "#a78bfa" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered>
            <Statistic
              title="In Review"
              value={s.points_in_review}
              suffix="pts"
              prefix={<ClockCircleOutlined style={{ fontSize: 16 }} />}
              valueStyle={{ color: "#facc15" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered>
            <Statistic
              title="Total Issues"
              value={s.total_issues}
              valueStyle={{ color: "#fafafa" }}
            />
          </Card>
        </Col>
      </Row>

      {/* Velocity chart */}
      <VelocityChart snapshot={snapshot} />

      {/* Cycle + Issue breakdown */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {snapshot.cycle && (
          <Col xs={24} md={12}>
            <Card
              bordered
              title={<Text strong>{snapshot.cycle.name ?? "Current Cycle"}</Text>}
              extra={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {new Date(snapshot.cycle.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  {" → "}
                  {new Date(snapshot.cycle.ends_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </Text>
              }
            >
              <Progress
                percent={Math.round(snapshot.cycle.progress * 100)}
                strokeColor="#a78bfa"
                trailColor="#27272a"
                style={{ marginBottom: 16 }}
              />
              <Flex justify="space-around">
                <Statistic title="Completed" value={snapshot.cycle.scope_completed} valueStyle={{ fontSize: 24 }} />
                <Divider type="vertical" style={{ height: "auto" }} />
                <Statistic title="Total" value={snapshot.cycle.scope_total} valueStyle={{ fontSize: 24 }} />
              </Flex>
            </Card>
          </Col>
        )}
        <Col xs={24} md={snapshot.cycle ? 12 : 24}>
          <Card bordered title={<Text strong>Issue Breakdown</Text>}>
            <Flex vertical gap={10}>
              {(["started", "unstarted", "backlog", "completed", "triage", "cancelled"] as StatusType[])
                .filter((st) => snapshot.by_status[st].count > 0)
                .map((st) => (
                  <Flex key={st} justify="space-between" align="center">
                    <Space>
                      <Badge status={statusColors[st] as "processing" | "success" | "error" | "default" | "warning"} />
                      <Text>{statusLabels[st]}</Text>
                    </Space>
                    <Space size="middle">
                      <Tooltip title={`${snapshot.by_status[st].points} story points`}>
                        <Text type="secondary">{snapshot.by_status[st].points} pts</Text>
                      </Tooltip>
                      <Tag bordered={false}>{snapshot.by_status[st].count}</Tag>
                    </Space>
                  </Flex>
                ))}
            </Flex>
          </Card>
        </Col>
      </Row>

      {/* Team members */}
      <Card
        bordered
        title={<Text strong>Team</Text>}
        extra={<Text type="secondary" style={{ fontSize: 12 }}>{snapshot.members.length} members</Text>}
        style={{ marginBottom: 24 }}
      >
        <Table<MemberStats>
          columns={memberColumns}
          dataSource={snapshot.members}
          rowKey="id"
          pagination={false}
          size="small"
          showHeader
        />
      </Card>

      {/* Blockers */}
      {snapshot.blockers.length > 0 && (
        <Card
          bordered
          title={
            <Space>
              <ExclamationCircleOutlined style={{ color: "#ef4444" }} />
              <Text strong>Blockers</Text>
              <Tag color="error" bordered={false}>{snapshot.blockers.length}</Tag>
            </Space>
          }
          style={{ marginBottom: 24 }}
        >
          <Table<FlaggedIssue>
            columns={flagColumns}
            dataSource={snapshot.blockers}
            rowKey={(r) => r.issue.id}
            pagination={false}
            size="small"
          />
        </Card>
      )}

      {/* Stale issues */}
      {snapshot.stale.length > 0 && (
        <Card
          bordered
          title={
            <Space>
              <WarningOutlined style={{ color: "#facc15" }} />
              <Text strong>Stale Issues</Text>
              <Tag color="warning" bordered={false}>{snapshot.stale.length}</Tag>
            </Space>
          }
          style={{ marginBottom: 24 }}
        >
          <Table<FlaggedIssue>
            columns={flagColumns}
            dataSource={snapshot.stale}
            rowKey={(r) => r.issue.id}
            pagination={false}
            size="small"
          />
        </Card>
      )}
    </div>
  );
}
