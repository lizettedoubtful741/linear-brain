import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { App as AntApp, Button, ConfigProvider, Layout, Menu, Tooltip, theme } from "antd";
import { DashboardOutlined, FileTextOutlined, ExperimentOutlined, AuditOutlined } from "@ant-design/icons";
import Dashboard from "./pages/Dashboard";
import ProposalList from "./pages/ProposalList";
import ProposalDetail from "./pages/ProposalDetail";
import Insights from "./pages/Insights";
import AuditLog from "./pages/AuditLog";

const { Header, Content } = Layout;

// shadcn-inspired dark palette
const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    // Core colors
    colorPrimary: "#a78bfa",        // soft violet
    colorBgContainer: "#0c0c0c",
    colorBgElevated: "#161616",
    colorBgLayout: "#09090b",
    colorBorder: "#27272a",
    colorBorderSecondary: "#1f1f23",

    // Text
    colorText: "#fafafa",
    colorTextSecondary: "#a1a1aa",
    colorTextTertiary: "#71717a",

    // Surfaces
    colorBgSpotlight: "#18181b",
    controlItemBgHover: "#1c1c1f",

    // Radius — shadcn uses subtle rounding
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,

    // Typography
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
    fontSize: 14,
  },
  components: {
    Layout: {
      headerBg: "#0c0c0c",
      bodyBg: "#09090b",
      siderBg: "#0c0c0c",
    },
    Menu: {
      darkItemBg: "#0c0c0c",
      darkItemSelectedBg: "#1c1c1f",
      darkItemHoverBg: "#1c1c1f",
    },
    Card: {
      colorBgContainer: "#0c0c0c",
      colorBorderSecondary: "#27272a",
    },
    Table: {
      colorBgContainer: "#0c0c0c",
      headerBg: "#0c0c0c",
      headerColor: "#a1a1aa",
      rowHoverBg: "#18181b",
      borderColor: "#1f1f23",
    },
    Button: {
      colorBgContainer: "#18181b",
      colorBorder: "#27272a",
    },
    Input: {
      colorBgContainer: "#0c0c0c",
      colorBorder: "#27272a",
      activeBorderColor: "#a78bfa",
    },
    Descriptions: {
      colorTextSecondary: "#a1a1aa",
    },
    Statistic: {
      colorTextDescription: "#a1a1aa",
    },
    Progress: {
      defaultColor: "#a78bfa",
    },
    Alert: {
      colorInfoBg: "#0c0c0c",
      colorInfoBorder: "#27272a",
      colorWarningBg: "#18181b",
      colorWarningBorder: "#854d0e40",
    },
  },
};

function NavMenu() {
  const location = useLocation();

  const selectedKey = location.pathname === "/" ? "dashboard"
    : location.pathname.startsWith("/proposals") ? "proposals"
    : location.pathname === "/insights" ? "insights"
    : location.pathname === "/audit" ? "audit"
    : "";

  return (
    <Menu
      theme="dark"
      mode="horizontal"
      selectedKeys={[selectedKey]}
      style={{ flex: 1, minWidth: 0, background: "transparent", borderBottom: "none" }}
      items={[
        { key: "dashboard", icon: <DashboardOutlined />, label: <Link to="/">Dashboard</Link> },
        { key: "proposals", icon: <FileTextOutlined />, label: <Link to="/proposals">Proposals</Link> },
        { key: "insights", icon: <ExperimentOutlined />, label: <Link to="/insights">Insights</Link> },
      ]}
    />
  );
}

export default function App() {
  return (
    <ConfigProvider theme={darkTheme}>
      <AntApp>
        <BrowserRouter>
          <Layout style={{ minHeight: "100vh" }}>
            <Header style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
              borderBottom: "1px solid #27272a",
              padding: "0 24px",
            }}>
              <Link to="/" style={{ color: "#fafafa", fontSize: 16, fontWeight: 600, whiteSpace: "nowrap", letterSpacing: "-0.025em" }}>
                Linear Brain
              </Link>
              <NavMenu />
              <Tooltip title="Audit Log">
                <Link to="/audit">
                  <Button type="text" icon={<AuditOutlined />} style={{ color: "#71717a" }} />
                </Link>
              </Tooltip>
            </Header>
            <Content style={{ padding: "32px 24px" }}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/proposals" element={<ProposalList />} />
                <Route path="/proposals/:id" element={<ProposalDetail />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/audit" element={<AuditLog />} />
              </Routes>
            </Content>
          </Layout>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}
