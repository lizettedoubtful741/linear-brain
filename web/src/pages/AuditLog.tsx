import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Table, App, Typography, Card, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { AuditEntry } from "../types";
import { fetchAuditLog } from "../api";

const { Text, Title } = Typography;

const actionColors: Record<string, string> = {
  proposal_created: "default",
  approved: "success",
  rejected: "error",
  executed: "processing",
  expired: "warning",
  error: "error",
};

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { message } = App.useApp();

  useEffect(() => {
    fetchAuditLog()
      .then(setEntries)
      .catch((err) => message.error(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const columns: ColumnsType<AuditEntry> = [
    {
      title: "Time",
      dataIndex: "created_at",
      width: 160,
      render: (val: string) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {new Date(val).toLocaleString("en-GB", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          })}
        </Text>
      ),
    },
    {
      title: "Action",
      dataIndex: "action",
      width: 160,
      render: (val: string) => (
        <Tag color={actionColors[val] ?? "default"} bordered={false}>{val}</Tag>
      ),
    },
    {
      title: "Proposal",
      dataIndex: "proposal_id",
      width: 200,
      render: (val: string | null) =>
        val ? (
          <Link to={`/proposals/${val}`}>
            <Typography.Text code style={{ fontSize: 12, color: "#a78bfa" }}>{val}</Typography.Text>
          </Link>
        ) : <Text type="secondary">—</Text>,
    },
    {
      title: "Details",
      dataIndex: "details",
      render: (val: string | null) =>
        val ? <Text type="secondary" style={{ fontSize: 12, wordBreak: "break-all" }}>{val}</Text> : <Text type="secondary">—</Text>,
    },
  ];

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <Title level={3} style={{ marginBottom: 20, letterSpacing: "-0.025em" }}>Audit Log</Title>
      <Card bordered>
        <Table<AuditEntry>
          columns={columns}
          dataSource={entries}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="middle"
        />
      </Card>
    </div>
  );
}
