"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

/* ---------------------------------------------------------------------
   CONSTANTES
--------------------------------------------------------------------- */
const PROGRAMMES = {
  mkd: { label: "Succession MKD", color: "#1C2F66", tint: "#EAEDF9" },
  serenity: { label: "Serenity SA", color: "#0F9D74", tint: "#E3F6EE" },
  mizzy: { label: "MIZZY & Co", color: "#A9752E", tint: "#FBF1DE" },
};

const STATUTS = {
  a_demarrer: { label: "À démarrer", color: "#1C2F66" },
  en_cours: { label: "En cours", color: "#A9752E" },
  termine: { label: "Terminé", color: "#0F9D74" },
};

function timeAgo(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "à l'instant";
  if (d < 3600) return Math.floor(d / 60) + " min";
  if (d < 86400) return Math.floor(d / 3600) + " h";
  return Math.floor(d / 86400) + " j";
}
function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

/* ---------------------------------------------------------------------
   COUCHE API
--------------------------------------------------------------------- */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (res.status === 401) {
    const err = new Error("unauthorized");
    err.unauthorized = true;
    throw err;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Requête échouée : " + path);
  }
  return res.json();
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function ensurePushSubscription() {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
    return "unsupported";
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const existing = await reg.pushManager.getSubscription();
    if (existing) return "granted";

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission;

    const { key } = await api("/api/push/vapid-public-key");
    if (!key) {
      console.warn("Clé VAPID absente côté serveur : les push resteront désactivés.");
      return permission;
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    await api("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub.toJSON()) });
    return "granted";
  } catch (e) {
    console.error("Abonnement push impossible :", e);
    return "denied";
  }
}

/* ---------------------------------------------------------------------
   ROOT APP
--------------------------------------------------------------------- */
export default function App() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [view, setView] = useState("deck");
  const [deckScope, setDeckScope] = useState("all");
  const [queue, setQueue] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState(null);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  // ---- session ----
  useEffect(() => {
    (async () => {
      try {
        const { user } = await api("/api/auth/me");
        setProfile(user);
      } catch {
        setProfile(null);
      }
      setReady(true);
    })();
  }, []);

  // ---- data polling once logged in ----
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    async function load() {
      try {
        const [t, n, u] = await Promise.all([
          api("/api/tasks"),
          api("/api/notifications"),
          api("/api/users"),
        ]);
        if (cancelled) return;
        setTasks(t.tasks);
        setNotifs(n.notifications);
        setCollaborators(u.users);
      } catch (e) {
        if (e.unauthorized) setProfile(null);
        else console.error(e);
      }
    }
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [profile]);

  // ---- deck queue: seeded once, then appended when new tasks arrive ----
  useEffect(() => {
    if (!profile) return;
    setQueue((q) => {
      const base = tasks.filter((t) => (deckScope === "mine" ? t.assignee === profile.name : true));
      const ids = base.map((t) => t.id);
      const known = new Set(q);
      const added = ids.filter((id) => !known.has(id));
      return q.length === 0 && added.length === ids.length ? ids : [...q, ...added];
    });
  }, [tasks, deckScope, profile]);

  useEffect(() => {
    if (!profile) return;
    const base = tasks.filter((t) => (deckScope === "mine" ? t.assignee === profile.name : true));
    setQueue(base.map((t) => t.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckScope]);

  const taskById = useMemo(() => {
    const m = {};
    tasks.forEach((t) => (m[t.id] = t));
    return m;
  }, [tasks]);

  async function handleLogin(name, code) {
    try {
      const { user } = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ name, code }) });
      setProfile(user);
      ensurePushSubscription().then(setNotifPermission);
    } catch (e) {
      showToast(e.message || "Connexion refusée");
    }
  }

  async function handleLogout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    setProfile(null);
    setTasks([]);
    setNotifs([]);
  }

  async function updateStatus(taskId, statut) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, statut } : t)));
    try {
      await api(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ statut }) });
    } catch (e) {
      showToast("Échec de la mise à jour");
    }
  }

  function advanceQueue(taskId) {
    setQueue((q) => q.filter((id) => id !== taskId));
  }

  async function handleSwipe(taskId, direction) {
    const statut = direction === "left" ? "termine" : direction === "up" ? "en_cours" : "a_demarrer";
    await updateStatus(taskId, statut);
    advanceQueue(taskId);
  }

  async function addTask(form) {
    try {
      const { task } = await api("/api/tasks", { method: "POST", body: JSON.stringify(form) });
      setTasks((prev) => [...prev, task]);
      if (form.assignee && !collaborators.includes(form.assignee)) {
        setCollaborators((c) => [...c, form.assignee]);
      }
      setShowAdd(false);
      showToast("Tâche ajoutée" + (form.assignee ? ` · assignée à ${form.assignee}` : ""));
    } catch (e) {
      showToast(e.message || "Échec de l'ajout");
    }
  }

  async function markAllRead() {
    setNotifs((prev) => prev.map((n) => ({ ...n, lu: true })));
    await api("/api/notifications/read", { method: "POST" }).catch(() => {});
  }

  const requestNotifPermission = async () => {
    const result = await ensurePushSubscription();
    setNotifPermission(result);
  };

  if (!ready) {
    return (
      <div className="pf-root pf-center">
        <Style />
        <div className="pf-loader">Chargement du dossier…</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="pf-root pf-center">
        <Style />
        <LoginGate onLogin={handleLogin} />
      </div>
    );
  }

  const unread = notifs.filter((n) => !n.lu).length;

  return (
    <div className="pf-root">
      <Style />
      <Header
        profile={profile}
        view={view}
        setView={setView}
        unread={unread}
        onLogout={handleLogout}
        notifPermission={notifPermission}
        requestNotifPermission={requestNotifPermission}
      />

      <main className="pf-main">
        {view === "deck" && (
          <DeckView
            queue={queue}
            taskById={taskById}
            deckScope={deckScope}
            setDeckScope={setDeckScope}
            onSwipe={handleSwipe}
            onReset={() => {
              const base = tasks.filter((t) => (deckScope === "mine" ? t.assignee === profile.name : true));
              setQueue(base.map((t) => t.id));
            }}
          />
        )}
        {view === "board" && (
          <BoardView
            tasks={tasks}
            collaborators={collaborators}
            onStatusChange={(id, s) => updateStatus(id, s)}
          />
        )}
        {view === "notifs" && <NotifsView notifs={notifs} onOpen={markAllRead} />}
      </main>

      <button className="pf-fab" onClick={() => setShowAdd(true)} aria-label="Ajouter une tâche">
        +
      </button>

      {showAdd && (
        <AddTaskModal collaborators={collaborators} onClose={() => setShowAdd(false)} onSubmit={addTask} />
      )}

      {toast && <div className="pf-toast">{toast}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------------
   LOGIN
--------------------------------------------------------------------- */
function LoginGate({ onLogin }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  return (
    <div className="pf-login">
      <div className="pf-login-eyebrow">DOSSIER DE PILOTAGE</div>
      <h1 className="pf-login-title">Le tri des tâches</h1>
      <p className="pf-login-sub">Succession MKD · Serenity SA · MIZZY &amp; Co</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onLogin(name, code);
        }}
        className="pf-login-form"
      >
        <label className="pf-label" htmlFor="pf-name">
          Votre nom, pour signer vos actions
        </label>
        <input
          id="pf-name"
          className="pf-input"
          placeholder="ex. Camille"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <label className="pf-label" htmlFor="pf-code">
          Code d'accès (si votre équipe en utilise un)
        </label>
        <input
          id="pf-code"
          className="pf-input"
          type="password"
          placeholder="optionnel"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button className="pf-btn pf-btn-primary" type="submit" disabled={!name.trim()}>
          Entrer dans le dossier
        </button>
      </form>
    </div>
  );
}

/* ---------------------------------------------------------------------
   HEADER
--------------------------------------------------------------------- */
function Header({ profile, view, setView, unread, onLogout, notifPermission, requestNotifPermission }) {
  return (
    <header className="pf-header">
      <div className="pf-header-top">
        <div>
          <div className="pf-eyebrow">DOCUMENT DE PILOTAGE</div>
          <div className="pf-title">Le tri des tâches</div>
        </div>
        <button className="pf-who" onClick={onLogout} title="Se déconnecter">
          <span className="pf-who-dot" />
          {profile.name}
        </button>
      </div>
      <nav className="pf-tabs">
        <button className={"pf-tab" + (view === "deck" ? " active" : "")} onClick={() => setView("deck")}>
          Trier
        </button>
        <button className={"pf-tab" + (view === "board" ? " active" : "")} onClick={() => setView("board")}>
          Tableau
        </button>
        <button className={"pf-tab" + (view === "notifs" ? " active" : "")} onClick={() => setView("notifs")}>
          Alertes {unread > 0 && <span className="pf-badge">{unread}</span>}
        </button>
        {notifPermission === "default" && (
          <button className="pf-tab pf-tab-ghost" onClick={requestNotifPermission}>
            Activer les alertes
          </button>
        )}
      </nav>
    </header>
  );
}

/* ---------------------------------------------------------------------
   DECK VIEW
--------------------------------------------------------------------- */
function DeckView({ queue, taskById, deckScope, setDeckScope, onSwipe, onReset }) {
  const visible = queue
    .slice(0, 3)
    .map((id) => taskById[id])
    .filter(Boolean);

  return (
    <div className="pf-deck-wrap">
      <div className="pf-deck-controls">
        <div className="pf-scope">
          <button className={"pf-scope-btn" + (deckScope === "all" ? " active" : "")} onClick={() => setDeckScope("all")}>
            Toutes
          </button>
          <button className={"pf-scope-btn" + (deckScope === "mine" ? " active" : "")} onClick={() => setDeckScope("mine")}>
            Les miennes
          </button>
        </div>
        <div className="pf-legend">
          <span><i className="pf-dot" style={{ background: STATUTS.termine.color }} /> ← Terminé</span>
          <span><i className="pf-dot" style={{ background: STATUTS.en_cours.color }} /> ↑ Bloqué</span>
          <span><i className="pf-dot" style={{ background: STATUTS.a_demarrer.color }} /> → À faire</span>
        </div>
      </div>

      <div className="pf-stage">
        {visible.length === 0 ? (
          <div className="pf-empty">
            <div className="pf-empty-mark">✓</div>
            <div className="pf-empty-title">Dossier trié</div>
            <p className="pf-empty-sub">
              {deckScope === "mine"
                ? "Aucune tâche qui vous est assignée n'attend de tri."
                : "Toutes les tâches de la pile ont été passées en revue."}
            </p>
            <button className="pf-btn pf-btn-outline" onClick={onReset}>
              Repasser la pile en revue
            </button>
          </div>
        ) : (
          visible
            .slice()
            .reverse()
            .map((t, i) => {
              const depth = visible.length - 1 - i;
              return (
                <SwipeCard key={t.id} task={t} depth={depth} interactive={depth === 0} onSwipe={(dir) => onSwipe(t.id, dir)} />
              );
            })
        )}
      </div>

      {visible.length > 0 && (
        <div className="pf-swipe-buttons">
          <button className="pf-round pf-round-green" onClick={() => onSwipe(visible[0].id, "left")} aria-label="Terminé">
            ✕
          </button>
          <button className="pf-round pf-round-bronze" onClick={() => onSwipe(visible[0].id, "up")} aria-label="Bloqué">
            ↑
          </button>
          <button className="pf-round pf-round-navy" onClick={() => onSwipe(visible[0].id, "right")} aria-label="À faire">
            →
          </button>
        </div>
      )}
    </div>
  );
}

function SwipeCard({ task, depth, interactive, onSwipe }) {
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const start = useRef({ x: 0, y: 0 });

  const prog = PROGRAMMES[task.programme];

  const onDown = (e) => {
    if (!interactive) return;
    const p = e.touches ? e.touches[0] : e;
    start.current = { x: p.clientX, y: p.clientY };
    setDrag((d) => ({ ...d, active: true }));
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  };
  const onMove = (e) => {
    const p = e.touches ? e.touches[0] : e;
    if (e.touches) e.preventDefault();
    const dx = p.clientX - start.current.x;
    const dy = p.clientY - start.current.y;
    setDrag({ x: dx, y: dy, active: true });
  };
  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", onUp);
    setDrag((d) => {
      const { x, y } = d;
      const THRESH = 110;
      if (y < -THRESH && Math.abs(y) > Math.abs(x)) fly("up");
      else if (x > THRESH) fly("right");
      else if (x < -THRESH) fly("left");
      else return { x: 0, y: 0, active: false };
      return d;
    });
  };
  const fly = (dir) => {
    const dest = dir === "left" ? { x: -900, y: -60 } : dir === "right" ? { x: 900, y: -60 } : { x: 0, y: -900 };
    setDrag({ x: dest.x, y: dest.y, active: false, flying: true });
    setTimeout(() => onSwipe(dir), 180);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (!interactive) return;
      if (e.key === "ArrowLeft") fly("left");
      if (e.key === "ArrowRight") fly("right");
      if (e.key === "ArrowUp") fly("up");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  const rot = drag.x / 18;
  const style = interactive
    ? {
        transform: `translate(${drag.x}px, ${drag.y}px) rotate(${rot}deg)`,
        transition: drag.active ? "none" : "transform 0.35s cubic-bezier(.2,.8,.2,1)",
      }
    : { transform: `translateY(${depth * 10}px) scale(${1 - depth * 0.035})` };

  const stampOpacity = {
    left: Math.min(1, Math.max(0, -drag.x / 110)),
    right: Math.min(1, Math.max(0, drag.x / 110)),
    up: Math.min(1, Math.max(0, -drag.y / 110)),
  };

  return (
    <div className="pf-card" style={{ ...style, zIndex: 10 - depth, borderTopColor: prog.color }} onMouseDown={onDown} onTouchStart={onDown}>
      {interactive && (
        <>
          <div className="pf-stamp pf-stamp-green" style={{ opacity: stampOpacity.left }}>TRAITÉ</div>
          <div className="pf-stamp pf-stamp-navy" style={{ opacity: stampOpacity.right }}>À FAIRE</div>
          <div className="pf-stamp pf-stamp-bronze pf-stamp-top" style={{ opacity: stampOpacity.up }}>BLOQUÉ</div>
        </>
      )}
      <div className="pf-card-top" style={{ color: prog.color, background: prog.tint }}>
        <span className="pf-chip-prog">{prog.label}</span>
        <span className="pf-card-due">{formatDate(task.echeance)}</span>
      </div>
      <div className="pf-card-body">
        <div className="pf-card-chantier">{task.chantier}</div>
        <div className="pf-card-titre">{task.titre}</div>
        {task.notes && <div className="pf-card-notes">{task.notes}</div>}
      </div>
      <div className="pf-card-foot">
        <span className={"pf-status-pill st-" + task.statut}>{STATUTS[task.statut].label}</span>
        <span className="pf-card-assignee">{task.assignee ? `→ ${task.assignee}` : "Non assignée"}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   BOARD VIEW
--------------------------------------------------------------------- */
function BoardView({ tasks, collaborators, onStatusChange }) {
  const [progFilter, setProgFilter] = useState(new Set(Object.keys(PROGRAMMES)));
  const [assigneeFilter, setAssigneeFilter] = useState("Tous");
  const [openId, setOpenId] = useState(null);

  const toggleProg = (k) => {
    setProgFilter((s) => {
      const next = new Set(s);
      next.has(k) ? next.delete(k) : next.add(k);
      return next.size ? next : s;
    });
  };

  const filtered = tasks.filter((t) => progFilter.has(t.programme) && (assigneeFilter === "Tous" || t.assignee === assigneeFilter));
  const columns = ["a_demarrer", "en_cours", "termine"];

  return (
    <div className="pf-board">
      <div className="pf-board-filters">
        <div className="pf-chipset">
          {Object.entries(PROGRAMMES).map(([k, p]) => (
            <button
              key={k}
              className={"pf-chip" + (progFilter.has(k) ? " active" : "")}
              style={{ borderColor: p.color, color: progFilter.has(k) ? "#fff" : p.color, background: progFilter.has(k) ? p.color : "transparent" }}
              onClick={() => toggleProg(k)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <select className="pf-select" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
          <option>Tous</option>
          {collaborators.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="pf-columns">
        {columns.map((col) => {
          const items = filtered.filter((t) => t.statut === col).sort((a, b) => (a.echeance || "").localeCompare(b.echeance || ""));
          return (
            <div className="pf-col" key={col}>
              <div className="pf-col-head" style={{ borderColor: STATUTS[col].color }}>
                <span>{STATUTS[col].label}</span>
                <span className="pf-col-count">{items.length}</span>
              </div>
              <div className="pf-col-body">
                {items.length === 0 && <div className="pf-col-empty">Rien ici</div>}
                {items.map((t) => (
                  <BoardCard key={t.id} task={t} open={openId === t.id} onToggle={() => setOpenId(openId === t.id ? null : t.id)} onStatusChange={onStatusChange} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard({ task, open, onToggle, onStatusChange }) {
  const prog = PROGRAMMES[task.programme];
  return (
    <div className="pf-bcard" style={{ borderLeftColor: prog.color }}>
      <div className="pf-bcard-head" onClick={onToggle}>
        <div>
          <div className="pf-bcard-chantier">{task.chantier}</div>
          <div className="pf-bcard-titre">{task.titre}</div>
        </div>
        <div className="pf-bcard-due">{formatDate(task.echeance)}</div>
      </div>
      <div className="pf-bcard-meta">
        <span className="pf-mono">{task.assignee || "non assignée"}</span>
      </div>
      {open && (
        <div className="pf-bcard-detail">
          {task.notes && <p className="pf-bcard-notes">{task.notes}</p>}
          <div className="pf-bcard-actions">
            {Object.entries(STATUTS).map(([k, s]) => (
              <button
                key={k}
                className={"pf-mini-btn" + (task.statut === k ? " active" : "")}
                style={{ borderColor: s.color, color: task.statut === k ? "#fff" : s.color, background: task.statut === k ? s.color : "transparent" }}
                onClick={() => onStatusChange(task.id, k)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="pf-bcard-history">
            {(task.historique || []).slice(-4).reverse().map((h, i) => (
              <div key={i} className="pf-hist-row">
                <span className="pf-mono">{timeAgo(h.le)}</span> — {h.par} → {STATUTS[h.statut].label}
              </div>
            ))}
            <div className="pf-hist-row pf-hist-created">créée par {task.creePar} · {timeAgo(task.creeLe)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   NOTIFICATIONS
--------------------------------------------------------------------- */
function NotifsView({ notifs, onOpen }) {
  useEffect(() => {
    onOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = [...notifs].sort((a, b) => new Date(b.creeLe) - new Date(a.creeLe));

  return (
    <div className="pf-notifs">
      {sorted.length === 0 && (
        <div className="pf-empty">
          <div className="pf-empty-mark">✉</div>
          <div className="pf-empty-title">Rien à signaler</div>
          <p className="pf-empty-sub">Les tâches qui vous sont assignées apparaîtront ici.</p>
        </div>
      )}
      {sorted.map((n) => (
        <div key={n.id} className={"pf-notif" + (n.lu ? "" : " unread")}>
          <div className="pf-notif-icon">{n.type === "assignation" ? "＋" : "↻"}</div>
          <div>
            <div className="pf-notif-msg">{n.message}</div>
            <div className="pf-notif-time pf-mono">{timeAgo(n.creeLe)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------
   ADD TASK MODAL
--------------------------------------------------------------------- */
function AddTaskModal({ collaborators, onClose, onSubmit }) {
  const [form, setForm] = useState({ titre: "", programme: "mkd", chantier: "", echeance: "", assignee: "", notes: "" });
  const [addingPerson, setAddingPerson] = useState(false);
  const [newPerson, setNewPerson] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (form.assignee === "__new") setAddingPerson(true);
  }, [form.assignee]);

  return (
    <div className="pf-modal-backdrop" onMouseDown={onClose}>
      <div className="pf-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pf-modal-eyebrow">NOUVELLE ENTRÉE AU DOSSIER</div>
        <h2 className="pf-modal-title">Ajouter une tâche</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.titre.trim()) return;
            onSubmit({ ...form, assignee: addingPerson ? newPerson.trim() : form.assignee });
          }}
        >
          <label className="pf-label">Intitulé de la tâche</label>
          <input className="pf-input" value={form.titre} onChange={set("titre")} autoFocus required />

          <label className="pf-label">Programme</label>
          <div className="pf-radio-row">
            {Object.entries(PROGRAMMES).map(([k, p]) => (
              <button
                type="button"
                key={k}
                className={"pf-radio" + (form.programme === k ? " active" : "")}
                style={{ borderColor: p.color, background: form.programme === k ? p.color : "transparent", color: form.programme === k ? "#fff" : p.color }}
                onClick={() => setForm((f) => ({ ...f, programme: k }))}
              >
                {p.label}
              </button>
            ))}
          </div>

          <label className="pf-label">Chantier / catégorie</label>
          <input className="pf-input" value={form.chantier} onChange={set("chantier")} placeholder="ex. Actions prioritaires à court terme" />

          <div className="pf-row2">
            <div>
              <label className="pf-label">Échéance</label>
              <input type="date" className="pf-input" value={form.echeance} onChange={set("echeance")} />
            </div>
            <div>
              <label className="pf-label">Assignée à</label>
              {!addingPerson ? (
                <select className="pf-select pf-select-full" value={form.assignee} onChange={set("assignee")}>
                  <option value="">— Choisir —</option>
                  {collaborators.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                  <option value="__new">+ Nouvelle personne…</option>
                </select>
              ) : (
                <input className="pf-input" autoFocus placeholder="Nom du collaborateur" value={newPerson} onChange={(e) => setNewPerson(e.target.value)} />
              )}
            </div>
          </div>

          <label className="pf-label">Notes (optionnel)</label>
          <textarea className="pf-input pf-textarea" value={form.notes} onChange={set("notes")} rows={2} />

          <div className="pf-modal-actions">
            <button type="button" className="pf-btn pf-btn-outline" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="pf-btn pf-btn-primary">
              Ajouter au dossier
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   STYLES
--------------------------------------------------------------------- */
function Style() {
  return (
    <style>{`
      :root {
        --navy-deep: #0E1B3C; --navy: #1C2F66; --navy-soft: #4A5A93; --navy-tint: #EAEDF9;
        --gold-deep: #A9752E; --gold: #D9A653; --gold-tint: #FBF1DE;
        --emerald: #0F9D74; --emerald-tint: #E3F6EE;
        --bg: #F5F6FB; --card: #FFFFFF; --border: #E3E6F0; --ink: #131A2E; --ink-soft: #5B6478;
        --gradient-gold: linear-gradient(135deg, var(--gold) 0%, var(--gold-deep) 100%);
        --gradient-navy: linear-gradient(165deg, var(--navy-deep), var(--navy) 130%);
        --shadow-sm: 0 1px 2px rgba(19,26,46,0.06);
        --shadow-md: 0 12px 28px rgba(19,26,46,0.10), 0 2px 6px rgba(19,26,46,0.06);
        --shadow-lg: 0 20px 48px rgba(14,27,60,0.18);
      }
      .pf-root { font-family: 'Instrument Sans', sans-serif; color: var(--ink); background: var(--bg);
        background-image:
          radial-gradient(circle at 100% 0%, rgba(217,166,83,0.10), transparent 45%),
          radial-gradient(circle at 0% 100%, rgba(28,47,102,0.08), transparent 45%);
        background-attachment: fixed; min-height: 100vh; width: 100%; display: flex; flex-direction: column; }
      .pf-root * { box-sizing: border-box; }
      .pf-center { align-items: center; justify-content: center; }
      .pf-loader { font-family: 'IBM Plex Mono', monospace; color: var(--ink-soft); letter-spacing: 0.06em; }
      .pf-mono { font-family: 'IBM Plex Mono', monospace; }
      .pf-login { max-width: 380px; padding: 40px 28px; text-align: center; }
      .pf-login-eyebrow { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.16em; color: var(--gold-deep); margin-bottom: 10px; font-weight: 600; }
      .pf-login-title { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 36px; letter-spacing: -0.01em; margin: 0 0 8px; color: var(--navy-deep); }
      .pf-login-sub { color: var(--ink-soft); font-size: 13px; margin-bottom: 26px; }
      .pf-login-form { display: flex; flex-direction: column; gap: 10px; text-align: left; }
      .pf-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-soft); margin: 10px 0 5px; display: block; font-weight: 600;}
      .pf-input, .pf-select { width: 100%; padding: 11px 13px; border: 1.5px solid var(--border); border-radius: 10px; background: var(--card); font-family: inherit; font-size: 14px; color: var(--ink); outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
      .pf-input:focus, .pf-select:focus { border-color: var(--navy); box-shadow: 0 0 0 3px var(--navy-tint); }
      .pf-select-full { width: 100%; }
      .pf-textarea { resize: vertical; }
      .pf-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .pf-btn { font-family: inherit; font-weight: 700; font-size: 13.5px; padding: 11px 20px; border-radius: 10px; border: none; cursor: pointer; transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease; }
      .pf-btn-primary { background: var(--navy); color: #fff; box-shadow: var(--shadow-sm); }
      .pf-btn-primary:hover:not(:disabled) { box-shadow: var(--shadow-md); transform: translateY(-1px); }
      .pf-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
      .pf-btn-outline { background: var(--navy-tint); color: var(--navy); }
      .pf-btn-outline:hover { background: var(--border); }
      .pf-header { padding: 18px 18px 14px; background: var(--gradient-navy); position: sticky; top: 0; z-index: 30;
        border-radius: 0 0 22px 22px; box-shadow: var(--shadow-lg); }
      .pf-header-top { display: flex; justify-content: space-between; align-items: flex-start; }
      .pf-eyebrow { font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 0.16em; color: var(--gold); font-weight: 600; }
      .pf-title { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 21px; letter-spacing: -0.01em; color: #fff; }
      .pf-who { font-family: 'IBM Plex Mono', monospace; font-size: 12px; display: flex; align-items: center; gap: 6px; color: rgba(255,255,255,0.75); background: none; border: none; cursor: pointer; padding: 4px; }
      .pf-who-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--gold); display: inline-block; }
      .pf-tabs { display: flex; gap: 2px; margin-top: 16px; overflow-x: auto; background: rgba(255,255,255,0.08); border-radius: 999px; padding: 4px; }
      .pf-tab { font-family: inherit; font-size: 13px; font-weight: 600; background: none; border: none; padding: 8px 16px; color: rgba(255,255,255,0.7); cursor: pointer; border-radius: 999px; white-space: nowrap; transition: background 0.15s ease, color 0.15s ease; }
      .pf-tab.active { color: var(--navy-deep); background: #fff; font-weight: 700; }
      .pf-tab-ghost { color: var(--gold); margin-left: auto; }
      .pf-badge { background: var(--gold); color: var(--navy-deep); border-radius: 10px; font-size: 10px; font-weight: 700; padding: 1px 6px; margin-left: 4px; }
      .pf-main { flex: 1; overflow-y: auto; padding: 20px 18px; padding-bottom: 90px; }
      .pf-deck-wrap { display: flex; flex-direction: column; align-items: center; }
      .pf-deck-controls { width: 100%; max-width: 380px; display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; }
      .pf-scope { display: flex; gap: 6px; }
      .pf-scope-btn { flex: 1; padding: 8px; border-radius: 10px; border: 1.5px solid var(--border); background: var(--card); font-family: inherit; font-weight: 600; font-size: 12.5px; cursor: pointer; color: var(--ink-soft); transition: all 0.15s ease; }
      .pf-scope-btn.active { border-color: var(--navy); color: var(--navy); background: var(--navy-tint); }
      .pf-legend { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--ink-soft); font-family: 'IBM Plex Mono', monospace; }
      .pf-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 3px; }
      .pf-stage { position: relative; width: 100%; max-width: 380px; height: 440px; }
      .pf-card { position: absolute; inset: 0; background: var(--card); border-radius: 22px; border-top: 5px solid;
        box-shadow: var(--shadow-md);
        display: flex; flex-direction: column; cursor: grab; touch-action: none; user-select: none; overflow: hidden; }
      .pf-card:active { cursor: grabbing; }
      .pf-card-top { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px 12px; font-weight: 700; font-size: 12px; letter-spacing: 0.03em; }
      .pf-chip-prog { text-transform: uppercase; letter-spacing: 0.04em; font-size: 11px; }
      .pf-card-due { font-family: 'IBM Plex Mono', monospace; font-weight: 600; }
      .pf-card-body { flex: 1; padding: 12px 20px; display: flex; flex-direction: column; gap: 10px; }
      .pf-card-chantier { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft); font-weight: 600; }
      .pf-card-titre { font-family: 'Bricolage Grotesque', sans-serif; font-size: 24px; line-height: 1.25; font-weight: 700; letter-spacing: -0.01em; color: var(--navy-deep); }
      .pf-card-notes { font-size: 13px; color: var(--ink-soft); border-left: 2px solid var(--border); padding-left: 10px; }
      .pf-card-foot { padding: 14px 20px 20px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); }
      .pf-status-pill { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; color: #fff; }
      .st-a_demarrer { background: var(--navy); } .st-en_cours { background: var(--gold-deep); } .st-termine { background: var(--emerald); }
      .pf-card-assignee { font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: var(--ink-soft); }
      .pf-stamp { position: absolute; top: 40%; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 26px;
        border-radius: 14px; padding: 8px 18px; letter-spacing: 0.03em; pointer-events: none; z-index: 5; color: #fff; box-shadow: var(--shadow-lg); }
      .pf-stamp-green { left: 24px; transform: rotate(-9deg); background: var(--emerald); }
      .pf-stamp-navy { right: 24px; transform: rotate(9deg); background: var(--navy); }
      .pf-stamp-bronze.pf-stamp-top { left: 50%; top: 18%; transform: translateX(-50%) rotate(-4deg); background: var(--gradient-gold); }
      .pf-swipe-buttons { display: flex; gap: 20px; margin-top: 24px; }
      .pf-round { width: 56px; height: 56px; border-radius: 50%; border: none; font-size: 20px; font-weight: 700; cursor: pointer; color: #fff; box-shadow: var(--shadow-md); transition: transform 0.15s ease; }
      .pf-round:hover { transform: translateY(-2px); }
      .pf-round-green { background: var(--emerald); } .pf-round-bronze { background: var(--gradient-gold); } .pf-round-navy { background: var(--navy); }
      .pf-empty { text-align: center; padding: 60px 20px; }
      .pf-empty-mark { width: 56px; height: 56px; margin: 0 auto; border-radius: 50%; background: var(--gradient-gold); color: #fff; font-size: 26px; font-weight: 700; display: flex; align-items: center; justify-content: center; box-shadow: var(--shadow-md); }
      .pf-empty-title { font-family: 'Bricolage Grotesque', sans-serif; font-size: 20px; font-weight: 700; margin: 14px 0 6px; color: var(--navy-deep); }
      .pf-empty-sub { color: var(--ink-soft); font-size: 13px; margin-bottom: 16px; }
      .pf-board-filters { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; align-items: center; justify-content: space-between; }
      .pf-chipset { display: flex; gap: 6px; flex-wrap: wrap; }
      .pf-chip { font-family: inherit; font-size: 12px; font-weight: 700; padding: 7px 14px; border-radius: 20px; border: 1.5px solid; cursor: pointer; transition: all 0.15s ease; }
      .pf-columns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
      @media (max-width: 720px) { .pf-columns { grid-template-columns: 1fr; } }
      .pf-col-head { display: flex; justify-content: space-between; font-weight: 700; font-size: 13px; padding-bottom: 10px; border-bottom: 3px solid; margin-bottom: 10px; border-radius: 2px; }
      .pf-col-count { font-family: 'IBM Plex Mono', monospace; color: var(--ink-soft); }
      .pf-col-body { display: flex; flex-direction: column; gap: 8px; min-height: 60px; }
      .pf-col-empty { font-size: 12px; color: var(--ink-soft); font-style: italic; padding: 10px 0; }
      .pf-bcard { background: var(--card); border-radius: 12px; border-left: 4px solid; padding: 11px 13px; box-shadow: var(--shadow-sm); }
      .pf-bcard-head { display: flex; justify-content: space-between; gap: 8px; cursor: pointer; }
      .pf-bcard-chantier { font-size: 10px; text-transform: uppercase; color: var(--ink-soft); font-weight: 600; }
      .pf-bcard-titre { font-family: 'Bricolage Grotesque', sans-serif; font-size: 15px; font-weight: 700; color: var(--navy-deep); }
      .pf-bcard-due { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-soft); white-space: nowrap; }
      .pf-bcard-meta { margin-top: 6px; font-size: 11px; color: var(--ink-soft); }
      .pf-bcard-detail { margin-top: 10px; border-top: 1px solid var(--border); padding-top: 10px; }
      .pf-bcard-notes { font-size: 12.5px; color: var(--ink-soft); margin-bottom: 8px; }
      .pf-bcard-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
      .pf-mini-btn { font-family: inherit; font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 14px; border: 1.5px solid; cursor: pointer; transition: all 0.15s ease; }
      .pf-bcard-history { font-size: 11px; color: var(--ink-soft); }
      .pf-hist-row { padding: 2px 0; }
      .pf-hist-created { font-style: italic; opacity: 0.8; }
      .pf-notifs { max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; gap: 8px; }
      .pf-notif { display: flex; gap: 10px; background: var(--card); border-radius: 12px; padding: 13px; box-shadow: var(--shadow-sm); }
      .pf-notif.unread { border-left: 3px solid var(--gold-deep); }
      .pf-notif-icon { font-size: 16px; }
      .pf-notif-msg { font-size: 13.5px; }
      .pf-notif-time { font-size: 10.5px; color: var(--ink-soft); margin-top: 3px; }
      .pf-fab { position: fixed; bottom: 22px; right: 22px; width: 56px; height: 56px; border-radius: 50%; background: var(--gradient-gold); color: #fff; font-size: 26px; border: none; box-shadow: var(--shadow-lg); cursor: pointer; z-index: 40; transition: transform 0.15s ease; }
      .pf-fab:hover { transform: scale(1.06); }
      .pf-modal-backdrop { position: fixed; inset: 0; background: rgba(14,27,60,0.45); display: flex; align-items: flex-end; justify-content: center; z-index: 50; }
      @media (min-width: 640px) { .pf-modal-backdrop { align-items: center; } }
      .pf-modal { background: var(--bg); width: 100%; max-width: 440px; border-radius: 20px 20px 0 0; padding: 22px 22px 26px; max-height: 88vh; overflow-y: auto; box-shadow: var(--shadow-lg); }
      @media (min-width: 640px) { .pf-modal { border-radius: 18px; } }
      .pf-modal-eyebrow { font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 0.12em; color: var(--gold-deep); font-weight: 600; }
      .pf-modal-title { font-family: 'Bricolage Grotesque', sans-serif; font-size: 23px; font-weight: 700; margin: 4px 0 10px; color: var(--navy-deep); }
      .pf-radio-row { display: flex; flex-wrap: wrap; gap: 6px; }
      .pf-radio { font-family: inherit; font-size: 12px; font-weight: 700; padding: 8px 14px; border-radius: 20px; border: 1.5px solid; cursor: pointer; transition: all 0.15s ease; }
      .pf-modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
      .pf-toast { position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%); background: var(--navy-deep); color: #fff; padding: 11px 20px; border-radius: 20px; font-size: 13px; z-index: 60; box-shadow: var(--shadow-lg); }
    `}</style>
  );
}
