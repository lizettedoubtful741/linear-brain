import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Table, Tag, Button, Popconfirm, App, Typography, Flex, Card, Badge,
  Collapse, Empty, Space, Tooltip,
} from "antd";
import { CheckOutlined, CloseOutlined, HistoryOutlined, InboxOutlined, ClearOutlined, AuditOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Proposal, ProposalStatus } from "../types";
import { fetchProposals, approveProposal, approveAll, rejectAll, cleanDrafts, auditBoard } from "../api";

const { Text, Title } = Typography;

const statusColors: Record<ProposalStatus, string> = {
  pending: "warning",
  approved: "success",
  rejected: "error",
  executed: "processing",
  expired: "default",
};

function formatType(type: string): string {
  return type.replace(/_/g, " ");
}

export default function ProposalList() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tidying, setTidying] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const { message, notification } = App.useApp();

  const load = async () => {
    setLoading(true);
    try {
      setProposals(await fetchProposals());
    } catch (err) {
      message.error(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (id: string) => {
    try {
      await approveProposal(id);
      message.success("Proposal approved and executed");
      load();
    } catch (err) {
      message.error(String(err));
    }
  };

  const handleApproveAll = async () => {
    try {
      const result = await approveAll();
      message.success(`Approved ${result.succeeded}, failed ${result.failed}`);
      load();
    } catch (err) {
      message.error(String(err));
    }
  };

  const handleRejectAll = async () => {
    try {
      const result = await rejectAll();
      message.success(`Rejected ${result.rejected} proposal${result.rejected === 1 ? "" : "s"}`);
      load();
    } catch (err) {
      message.error(String(err));
    }
  };

  const handleTidyDrafts = async () => {
    setTidying(true);
    try {
      const result = await cleanDrafts();
      if (result.proposalCount === 0) {
        notification.info({
          message: "No drafts found",
          description: "There are no tickets tagged DRAFT on the board.",
        });
      } else {
        notification.success({
          message: `Tidied ${result.proposalCount} draft${result.proposalCount === 1 ? "" : "s"}`,
          description: `Proposals created for: ${result.issues.join(", ")}. Review them below.`,
          duration: 8,
        });
        load();
      }
    } catch (err) {
      notification.error({
        message: "Tidy drafts failed",
        description: String(err),
      });
    } finally {
      setTidying(false);
    }
  };

  const handleAuditBoard = async () => {
    setAuditing(true);
    try {
      const result = await auditBoard();
      if (result.proposalCount === 0) {
        notification.info({
          message: "Board looks clean",
          description: "No significant issues found during the audit.",
        });
      } else {
        notification.success({
          message: `Audit found ${result.proposalCount} issue${result.proposalCount === 1 ? "" : "s"}`,
          description: `Proposals created for: ${result.issues.join(", ")}. Review them below.`,
          duration: 8,
        });
        load();
      }
    } catch (err) {
      notification.error({
        message: "Board audit failed",
        description: String(err),
      });
    } finally {
      setAuditing(false);
    }
  };

  const pending = proposals.filter((p) => p.status === "pending");
  const history = proposals.filter((p) => p.status !== "pending");

  function getIdentifier(record: Proposal): string | null {
    try {
      const payload = JSON.parse(record.payload) as { identifier?: string };
      return payload.identifier ?? null;
    } catch {
      return null;
    }
  }

  const columns: ColumnsType<Proposal> = [
    {
      title: "Ticket",
      width: 100,
      render: (_: unknown, record: Proposal) => {
        const id = getIdentifier(record);
        return id ? (
          <a href={`https://linear.app/issue/${id}`} target="_blank" rel="noopener noreferrer">
            <Typography.Text code style={{ fontSize: 12, color: "#a78bfa" }}>{id}</Typography.Text>
          </a>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        );
      },
    },
    {
      title: "Summary",
      dataIndex: "summary",
      render: (_: string, record: Proposal) => (
        <div>
          <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {formatType(record.type)}
          </Text>
          <br />
          <Link to={`/proposals/${record.id}`}>
            <Text strong style={{ color: "#a78bfa" }}>{record.summary}</Text>
          </Link>
        </div>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 110,
      render: (status: ProposalStatus) => (
        <Tag color={statusColors[status]} bordered={false}>{status.toUpperCase()}</Tag>
      ),
    },
    {
      title: "Action",
      width: 100,
      render: (_: unknown, record: Proposal) =>
        record.status === "pending" ? (
          <Button type="primary" size="small" onClick={() => handleApprove(record.id)}>
            Approve
          </Button>
        ) : null,
    },
  ];

  const historyColumns = columns.filter((c) => c.title !== "Action");

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <Flex justify="space-between" align="center" style={{ marginBottom: 20 }}>
        <Flex align="center" gap={12}>
          <Title level={3} style={{ margin: 0, letterSpacing: "-0.025em" }}>Proposals</Title>
          {pending.length > 0 && (
            <Badge count={pending.length} color="#a78bfa" />
          )}
        </Flex>
        <Space>
          <Tooltip title="Audit the whole board for issues, inconsistencies, and improvements">
            <Button
              icon={<AuditOutlined />}
              loading={auditing}
              onClick={handleAuditBoard}
              disabled={tidying}
            >
              {auditing ? "Auditing..." : "Audit Board"}
            </Button>
          </Tooltip>
          <Tooltip title="Find all DRAFT tickets, clean them up, and submit as proposals">
            <Button
              icon={<ClearOutlined />}
              loading={tidying}
              onClick={handleTidyDrafts}
              disabled={auditing}
            >
              {tidying ? "Tidying..." : "Tidy Drafts"}
            </Button>
          </Tooltip>
          {pending.length >= 1 && (
            <>
              <Popconfirm
                title="Reject all pending proposals?"
                description={`This will reject ${pending.length} proposal${pending.length === 1 ? "" : "s"}.`}
                onConfirm={handleRejectAll}
              >
                <Button danger icon={<CloseOutlined />}>
                  Reject All
                </Button>
              </Popconfirm>
              <Popconfirm
                title="Approve all pending proposals?"
                description={`This will approve and execute ${pending.length} proposal${pending.length === 1 ? "" : "s"}.`}
                onConfirm={handleApproveAll}
              >
                <Button type="primary" icon={<CheckOutlined />}>
                  Approve All ({pending.length})
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      </Flex>

      {/* Pending queue */}
      <Card bordered style={{ marginBottom: 24 }}>
        {!loading && pending.length === 0 ? (
          <Empty
            image={<InboxOutlined style={{ fontSize: 48, color: "#71717a" }} />}
            description={<Text type="secondary">No proposals in the queue</Text>}
          />
        ) : (
          <Table<Proposal>
            columns={columns}
            dataSource={pending}
            rowKey="id"
            loading={loading}
            pagination={false}
            size="middle"
          />
        )}
      </Card>

      {/* History accordion */}
      {history.length > 0 && (
        <Collapse
          ghost
          items={[{
            key: "history",
            label: (
              <Flex align="center" gap={8}>
                <HistoryOutlined />
                <Text type="secondary">History ({history.length})</Text>
              </Flex>
            ),
            children: (
              <Table<Proposal>
                columns={historyColumns}
                dataSource={history}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 10, size: "small", showSizeChanger: false }}
              />
            ),
          }]}
        />
      )}
    </div>
  );
}
