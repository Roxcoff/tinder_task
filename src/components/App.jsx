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
  const [notifPermission, setNotifPermission] = useState("unsupported");

  useEffect(() => {
    if (typeof Notification !== "undefined") setNotifPermission(Notification.permission);
  }, []);

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
        <div className="pf-loader">Chargement du dossier…</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="pf-root pf-center">
        <LoginGate onLogin={handleLogin} />
      </div>
    );
  }

  const unread = notifs.filter((n) => !n.lu).length;

  return (
    <div className="pf-root">
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
