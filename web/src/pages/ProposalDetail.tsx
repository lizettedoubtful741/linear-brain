import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Card, Tag, Button, Descriptions, Typography, Space,
  Spin, App, Flex, Divider, Result, Collapse,
} from "antd";
import { ArrowLeftOutlined, CheckOutlined, CloseOutlined, CodeOutlined } from "@ant-design/icons";
import type { Proposal, ProposalStatus } from "../types";
import { fetchProposal, approveProposal, rejectProposal } from "../api";

const { Text, Title, Paragraph } = Typography;

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

// Render a structured payload as readable Descriptions instead of raw JSON
function PayloadView({ payload }: { payload: string }) {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return <CodeBlock content={payload} />;
  }

  // Known field renderers
  const fields: { key: string; label: string; render?: (val: unknown) => React.ReactNode }[] = [
    { key: "identifier", label: "Issue", render: (val) => (
      <a href={`https://linear.app/issue/${String(val)}`} target="_blank" rel="noopener noreferrer">
        <Typography.Text code style={{ fontSize: 12, color: "#a78bfa" }}>{String(val)}</Typography.Text>
      </a>
    )},
    { key: "title", label: "Title" },
    { key: "description", label: "Description", render: (val) => (
      <Paragraph style={{ whiteSpace: "pre-wrap", margin: 0 }}>{String(val)}</Paragraph>
    )},
    { key: "estimate", label: "Estimate", render: (val) => (
      val != null ? <Tag bordered={false}>{String(val)} pts</Tag> : <Text type="secondary">None</Text>
    )},
    { key: "labelsToAdd", label: "Add Labels", render: (val) => (
      <Space size={4} wrap>
        {(val as string[]).map((l) => <Tag key={l} color="success" bordered={false}>{l}</Tag>)}
      </Space>
    )},
    { key: "labelsToRemove", label: "Remove Labels", render: (val) => (
      <Space size={4} wrap>
        {(val as string[]).map((l) => <Tag key={l} color="error" bordered={false}>{l}</Tag>)}
      </Space>
    )},
    { key: "issueId", label: "Issue ID", render: (val) => (
      <Text code style={{ fontSize: 12 }}>{String(val)}</Text>
    )},
    { key: "body", label: "Comment", render: (val) => (
      <Paragraph style={{ whiteSpace: "pre-wrap", margin: 0 }}>{String(val)}</Paragraph>
    )},
    { key: "stateId", label: "Move To" },
    { key: "assigneeId", label: "Assignee ID" },
  ];

  const renderedKeys = new Set<string>();
  const items = fields
    .filter((f) => parsed[f.key] !== undefined && parsed[f.key] !== null)
    .map((f) => {
      renderedKeys.add(f.key);
      const val = parsed[f.key];
      return (
        <Descriptions.Item key={f.key} label={f.label}>
          {f.render ? f.render(val) : String(val)}
        </Descriptions.Item>
      );
    });

  // Any remaining fields not in our known list
  const extraKeys = Object.keys(parsed).filter((k) => !renderedKeys.has(k));

  return (
    <div style={{ marginBottom: 24 }}>
      {items.length > 0 && (
        <Descriptions
          column={1}
          size="small"
          bordered
          labelStyle={{ width: 130, color: "#a1a1aa" }}
          style={{ marginBottom: extraKeys.length > 0 ? 12 : 0 }}
        >
          {items}
        </Descriptions>
      )}
      {/* Always show raw JSON in a collapsible */}
      <Collapse
        ghost
        size="small"
        items={[{
          key: "raw",
          label: (
            <Flex align="center" gap={6}>
              <CodeOutlined />
              <Text type="secondary" style={{ fontSize: 12 }}>Raw JSON</Text>
            </Flex>
          ),
          children: <CodeBlock content={JSON.stringify(parsed, null, 2)} />,
        }]}
      />
    </div>
  );
}

function CodeBlock({ content }: { content: string }) {
  return (
    <Typography.Text code style={{
      display: "block",
      padding: 16,
      borderRadius: 8,
      fontSize: 12,
      whiteSpace: "pre-wrap",
      wordBreak: "break-all",
      background: "#18181b",
      border: "1px solid #27272a",
    }}>
      {content}
    </Typography.Text>
  );
}

export default function ProposalDetail() {
  const { id } = useParams<{ id: string }>();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const { message } = App.useApp();

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      setProposal(await fetchProposal(id));
    } catch (err) {
      message.error(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleApprove = async () => {
    if (!id) return;
    try {
      await approveProposal(id);
      message.success("Proposal approved and executed");
      load();
    } catch (err) {
      message.error(String(err));
    }
  };

  const handleReject = async () => {
    if (!id) return;
    try {
      await rejectProposal(id, "");
      message.success("Proposal rejected");
      load();
    } catch (err) {
      message.error(String(err));
    }
  };

  if (loading) return <Spin style={{ display: "block", margin: "80px auto" }} size="large" />;

  if (!proposal) {
    return (
      <Result
        status="404"
        title="Proposal not found"
        extra={<Link to="/proposals"><Button type="primary">Back to Proposals</Button></Link>}
      />
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <Link to="/proposals">
        <Button type="text" icon={<ArrowLeftOutlined />} style={{ marginBottom: 16, padding: "4px 8px" }}>
          Back to proposals
        </Button>
      </Link>

      <Card bordered>
        <Flex justify="space-between" align="flex-start" style={{ marginBottom: 20 }}>
          <div>
            <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {formatType(proposal.type)}
            </Text>
            <Title level={4} style={{ margin: "4px 0 0", letterSpacing: "-0.025em" }}>{proposal.summary}</Title>
          </div>
          <Tag color={statusColors[proposal.status]} bordered={false} style={{ fontSize: 13 }}>
            {proposal.status.toUpperCase()}
          </Tag>
        </Flex>

        <Descriptions
          column={1}
          size="small"
          bordered
          style={{ marginBottom: 24 }}
          labelStyle={{ width: 120, color: "#a1a1aa" }}
        >
          <Descriptions.Item label="Created">
            {new Date(proposal.created_at).toLocaleString("en-GB")}
          </Descriptions.Item>
          {proposal.reviewed_at && (
            <Descriptions.Item label="Reviewed">
              {new Date(proposal.reviewed_at).toLocaleString("en-GB")}
              {proposal.reviewed_by && <Text type="secondary"> by {proposal.reviewed_by}</Text>}
            </Descriptions.Item>
          )}
          {proposal.executed_at && (
            <Descriptions.Item label="Executed">
              {new Date(proposal.executed_at).toLocaleString("en-GB")}
            </Descriptions.Item>
          )}
        </Descriptions>

        <Divider orientationMargin={0}>
          <Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Reasoning
          </Text>
        </Divider>
        <Paragraph style={{ marginBottom: 24 }}>{proposal.reasoning}</Paragraph>

        <Divider orientationMargin={0}>
          <Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Changes
          </Text>
        </Divider>
        <PayloadView payload={proposal.payload} />

        {proposal.feedback && (
          <>
            <Divider orientationMargin={0}>
              <Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Rejection Feedback
              </Text>
            </Divider>
            <Paragraph style={{ marginBottom: 24 }}>{proposal.feedback}</Paragraph>
          </>
        )}

        {proposal.execution_result && (
          <>
            <Divider orientationMargin={0}>
              <Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Execution Result
              </Text>
            </Divider>
            <CodeBlock content={proposal.execution_result} />
            <div style={{ marginBottom: 24 }} />
          </>
        )}

        {proposal.status === "pending" && (
          <>
            <Divider />
            <Flex justify="flex-end" gap={12}>
              <Button danger icon={<CloseOutlined />} onClick={handleReject}>
                Reject
              </Button>
              <Button type="primary" icon={<CheckOutlined />} onClick={handleApprove}>
                Approve & Execute
              </Button>
            </Flex>
          </>
        )}
      </Card>
    </div>
  );
}
