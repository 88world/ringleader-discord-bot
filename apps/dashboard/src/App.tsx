import { useEffect, useMemo, useState } from "react";
import axios from "axios";

type GuildConfig = {
  guildId: string;
  rulesChannelId: string | null;
  welcomeChannelId: string | null;
  modlogChannelId: string | null;
  ticketCategoryId: string | null;
  autoroleId: string | null;
  welcomeEnabled: boolean;
};

type Tracker = {
  id: string;
  kind: string;
  sourceId: string;
  destinationChannel: string;
};

type DiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  isAdmin: boolean;
};

type AuthResponse = {
  user: {
    id: string;
    username: string;
  };
  guilds: DiscordGuild[];
};

type Channel = {
  id: string;
  name: string;
};

type EmbedPreset = {
  id: string;
  name: string;
  payloadJson: string;
};

type AutoModRule = {
  id: string;
  name: string;
  kind: string;
  pattern: string;
  action: string;
  threshold: number;
  windowSeconds: number;
  timeoutMinutes: number;
  enabled: boolean;
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? "http://localhost:8080",
  withCredentials: true,
});

const emptyEmbed = {
  title: "",
  description: "",
  color: "#22d3ee",
  footerText: "",
  imageUrl: "",
  thumbnailUrl: "",
};

const embedHexToDecimal = (hex: string) => {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(value) ? value : 0x22d3ee;
};

export const App = () => {
  const [status, setStatus] = useState("Checking session...");
  const [authed, setAuthed] = useState(false);
  const [userName, setUserName] = useState("");
  const [guilds, setGuilds] = useState<DiscordGuild[]>([]);
  const [guildId, setGuildId] = useState("");
  const [config, setConfig] = useState<GuildConfig | null>(null);
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [embedPresets, setEmbedPresets] = useState<EmbedPreset[]>([]);
  const [embedName, setEmbedName] = useState("announcement");
  const [embedEditor, setEmbedEditor] = useState(emptyEmbed);
  const [previewChannelId, setPreviewChannelId] = useState("");
  const [automodRules, setAutomodRules] = useState<AutoModRule[]>([]);
  const [newRule, setNewRule] = useState({
    name: "No invite links",
    kind: "invite",
    pattern: "",
    action: "delete",
    threshold: 1,
    windowSeconds: 60,
    timeoutMinutes: 10,
  });

  const loginUrl = useMemo(() => `${api.defaults.baseURL}/auth/discord/login`, []);

  const checkAuth = async () => {
    try {
      const me = await api.get<AuthResponse>("/auth/me");
      setAuthed(true);
      setUserName(me.data.user.username);
      const adminGuilds = me.data.guilds.filter((x) => x.isAdmin);
      setGuilds(adminGuilds);
      if (!guildId && adminGuilds.length > 0) {
        setGuildId(adminGuilds[0].id);
      }
      setStatus("Signed in.");
    } catch {
      setAuthed(false);
      setStatus("Not signed in.");
    }
  };

  useEffect(() => {
    void checkAuth();
  }, []);

  const loadGuildData = async () => {
    if (!guildId) {
      setStatus("Select a guild first.");
      return;
    }

    try {
      const [cfgRes, trackersRes, channelsRes, embedsRes, automodRes] = await Promise.all([
        api.get<GuildConfig>(`/guilds/${guildId}/config`),
        api.get<Tracker[]>(`/guilds/${guildId}/trackers`),
        api.get<Channel[]>(`/guilds/${guildId}/channels`),
        api.get<EmbedPreset[]>(`/guilds/${guildId}/embeds`),
        api.get<AutoModRule[]>(`/guilds/${guildId}/automod-rules`),
      ]);

      setConfig(cfgRes.data);
      setTrackers(trackersRes.data);
      setChannels(channelsRes.data);
      setEmbedPresets(embedsRes.data);
      setAutomodRules(automodRes.data);
      setStatus("Guild loaded.");
    } catch {
      setStatus("Failed to load guild data.");
    }
  };

  useEffect(() => {
    if (authed && guildId) {
      void loadGuildData();
    }
  }, [authed, guildId]);

  const saveConfig = async () => {
    if (!config) {
      return;
    }

    try {
      await api.post(`/guilds/${guildId}/config`, config);
      setStatus("Core config saved.");
    } catch {
      setStatus("Failed to save core config.");
    }
  };

  const buildEmbedPayload = () => {
    const payload: Record<string, unknown> = {
      title: embedEditor.title || undefined,
      description: embedEditor.description || undefined,
      color: embedHexToDecimal(embedEditor.color),
      footer: embedEditor.footerText ? { text: embedEditor.footerText } : undefined,
      image: embedEditor.imageUrl ? { url: embedEditor.imageUrl } : undefined,
      thumbnail: embedEditor.thumbnailUrl ? { url: embedEditor.thumbnailUrl } : undefined,
    };

    return payload;
  };

  const saveEmbedPreset = async () => {
    try {
      await api.post(`/guilds/${guildId}/embeds`, {
        name: embedName,
        embed: buildEmbedPayload(),
      });
      const refreshed = await api.get<EmbedPreset[]>(`/guilds/${guildId}/embeds`);
      setEmbedPresets(refreshed.data);
      setStatus("Embed preset saved.");
    } catch {
      setStatus("Failed to save embed preset.");
    }
  };

  const sendPreviewEmbed = async () => {
    if (!previewChannelId) {
      setStatus("Select a preview channel.");
      return;
    }

    try {
      await api.post(`/guilds/${guildId}/embeds/preview`, {
        channelId: previewChannelId,
        embed: buildEmbedPayload(),
      });
      setStatus("Embed preview sent.");
    } catch {
      setStatus("Failed to send embed preview.");
    }
  };

  const createAutoModRule = async () => {
    try {
      await api.post(`/guilds/${guildId}/automod-rules`, newRule);
      const refreshed = await api.get<AutoModRule[]>(`/guilds/${guildId}/automod-rules`);
      setAutomodRules(refreshed.data);
      setStatus("AutoMod rule created.");
    } catch {
      setStatus("Failed to create automod rule.");
    }
  };

  const toggleAutoModRule = async (rule: AutoModRule) => {
    try {
      await api.put(`/guilds/${guildId}/automod-rules/${rule.id}`, {
        enabled: !rule.enabled,
      });
      const refreshed = await api.get<AutoModRule[]>(`/guilds/${guildId}/automod-rules`);
      setAutomodRules(refreshed.data);
      setStatus("AutoMod rule updated.");
    } catch {
      setStatus("Failed to update automod rule.");
    }
  };

  const deleteAutoModRule = async (ruleId: string) => {
    try {
      await api.delete(`/guilds/${guildId}/automod-rules/${ruleId}`);
      setAutomodRules((rows) => rows.filter((r) => r.id !== ruleId));
      setStatus("AutoMod rule deleted.");
    } catch {
      setStatus("Failed to delete automod rule.");
    }
  };

  const logout = async () => {
    await api.post("/auth/logout").catch(() => null);
    setAuthed(false);
    setGuildId("");
    setConfig(null);
    setTrackers([]);
    setChannels([]);
    setEmbedPresets([]);
    setAutomodRules([]);
    setStatus("Signed out.");
  };

  return (
    <div className="page">
      <div className="bg-orb orb-a" />
      <div className="bg-orb orb-b" />

      <header className="hero">
        <p className="eyebrow">Ringleader Mission Control</p>
        <h1>Dashboard and Automation Suite</h1>
        <p>OAuth-secured Discord dashboard with visual embeds, automod policy control, and core bot systems.</p>
      </header>

      <section className="panel">
        <h2>Session</h2>
        {!authed ? (
          <div className="row">
            <a className="button-link" href={loginUrl}>
              Sign in with Discord
            </a>
            <span className="status">{status}</span>
          </div>
        ) : (
          <div className="row space-between">
            <div>
              <strong>{userName}</strong>
              <p className="muted">Authorized via Discord OAuth</p>
            </div>
            <div className="row">
              <select value={guildId} onChange={(e) => setGuildId(e.target.value)}>
                {guilds.map((guild) => (
                  <option key={guild.id} value={guild.id}>
                    {guild.name}
                  </option>
                ))}
              </select>
              <button onClick={() => void loadGuildData()}>Reload</button>
              <button className="danger" onClick={() => void logout()}>
                Logout
              </button>
            </div>
          </div>
        )}
      </section>

      {authed && config && (
        <>
          <section className="panel">
            <h2>Core Systems</h2>
            <div className="grid three">
              <label>
                Rules Channel ID
                <input
                  value={config.rulesChannelId ?? ""}
                  onChange={(e) => setConfig({ ...config, rulesChannelId: e.target.value || null })}
                />
              </label>
              <label>
                Welcome Channel ID
                <input
                  value={config.welcomeChannelId ?? ""}
                  onChange={(e) => setConfig({ ...config, welcomeChannelId: e.target.value || null })}
                />
              </label>
              <label>
                Modlogs Channel ID
                <input
                  value={config.modlogChannelId ?? ""}
                  onChange={(e) => setConfig({ ...config, modlogChannelId: e.target.value || null })}
                />
              </label>
              <label>
                Ticket Category ID
                <input
                  value={config.ticketCategoryId ?? ""}
                  onChange={(e) => setConfig({ ...config, ticketCategoryId: e.target.value || null })}
                />
              </label>
              <label>
                Autorole ID
                <input
                  value={config.autoroleId ?? ""}
                  onChange={(e) => setConfig({ ...config, autoroleId: e.target.value || null })}
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={config.welcomeEnabled}
                  onChange={(e) => setConfig({ ...config, welcomeEnabled: e.target.checked })}
                />
                Welcome Enabled
              </label>
            </div>
            <button className="save" onClick={() => void saveConfig()}>
              Save Core Config
            </button>
          </section>

          <section className="panel">
            <h2>Visual Embed Designer</h2>
            <div className="grid three">
              <label>
                Preset Name
                <input value={embedName} onChange={(e) => setEmbedName(e.target.value)} />
              </label>
              <label>
                Embed Title
                <input value={embedEditor.title} onChange={(e) => setEmbedEditor({ ...embedEditor, title: e.target.value })} />
              </label>
              <label>
                Color
                <input
                  type="color"
                  value={embedEditor.color}
                  onChange={(e) => setEmbedEditor({ ...embedEditor, color: e.target.value })}
                />
              </label>
            </div>
            <label>
              Description
              <textarea
                rows={4}
                value={embedEditor.description}
                onChange={(e) => setEmbedEditor({ ...embedEditor, description: e.target.value })}
              />
            </label>
            <div className="grid two">
              <label>
                Footer Text
                <input
                  value={embedEditor.footerText}
                  onChange={(e) => setEmbedEditor({ ...embedEditor, footerText: e.target.value })}
                />
              </label>
              <label>
                Image URL
                <input
                  value={embedEditor.imageUrl}
                  onChange={(e) => setEmbedEditor({ ...embedEditor, imageUrl: e.target.value })}
                />
              </label>
            </div>
            <div className="grid two">
              <label>
                Thumbnail URL
                <input
                  value={embedEditor.thumbnailUrl}
                  onChange={(e) => setEmbedEditor({ ...embedEditor, thumbnailUrl: e.target.value })}
                />
              </label>
              <label>
                Preview Channel
                <select value={previewChannelId} onChange={(e) => setPreviewChannelId(e.target.value)}>
                  <option value="">Select channel</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      #{channel.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="row">
              <button onClick={() => void saveEmbedPreset()}>Save Preset</button>
              <button onClick={() => void sendPreviewEmbed()}>Send Preview</button>
            </div>
            <ul className="tracker-list">
              {embedPresets.map((preset) => (
                <li key={preset.id}>
                  <strong>{preset.name}</strong>
                  <span className="muted">Saved preset</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h2>AutoMod Rules</h2>
            <div className="grid three">
              <label>
                Rule Name
                <input value={newRule.name} onChange={(e) => setNewRule({ ...newRule, name: e.target.value })} />
              </label>
              <label>
                Kind
                <select value={newRule.kind} onChange={(e) => setNewRule({ ...newRule, kind: e.target.value })}>
                  <option value="invite">Invite Link</option>
                  <option value="keyword">Keyword</option>
                  <option value="regex">Regex</option>
                </select>
              </label>
              <label>
                Action
                <select value={newRule.action} onChange={(e) => setNewRule({ ...newRule, action: e.target.value })}>
                  <option value="delete">Delete</option>
                  <option value="warn">Warn</option>
                  <option value="timeout">Timeout</option>
                </select>
              </label>
              <label>
                Pattern
                <input value={newRule.pattern} onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })} />
              </label>
              <label>
                Threshold
                <input
                  type="number"
                  min={1}
                  value={newRule.threshold}
                  onChange={(e) => setNewRule({ ...newRule, threshold: Number(e.target.value || 1) })}
                />
              </label>
              <label>
                Window (seconds)
                <input
                  type="number"
                  min={1}
                  value={newRule.windowSeconds}
                  onChange={(e) => setNewRule({ ...newRule, windowSeconds: Number(e.target.value || 60) })}
                />
              </label>
            </div>
            <button className="save" onClick={() => void createAutoModRule()}>
              Create Rule
            </button>

            <ul className="tracker-list">
              {automodRules.length === 0 && <li>No automod rules configured.</li>}
              {automodRules.map((rule) => (
                <li key={rule.id}>
                  <strong>
                    {rule.name} ({rule.kind})
                  </strong>
                  <span>
                    action: {rule.action} | threshold: {rule.threshold} in {rule.windowSeconds}s
                  </span>
                  <div className="row">
                    <button onClick={() => void toggleAutoModRule(rule)}>{rule.enabled ? "Disable" : "Enable"}</button>
                    <button className="danger" onClick={() => void deleteAutoModRule(rule.id)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h2>Trackers</h2>
            <p className="muted">Configure trackers in Discord slash commands, then monitor them here.</p>
            <ul className="tracker-list">
              {trackers.length === 0 && <li>No trackers configured yet.</li>}
              {trackers.map((tracker) => (
                <li key={tracker.id}>
                  <strong>{tracker.kind.toUpperCase()}</strong>
                  <span>{tracker.sourceId}</span>
                  <span>#{tracker.destinationChannel}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <p className="status">{status}</p>
    </div>
  );
};
