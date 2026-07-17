// Injected into /play/index.html for HTML5 visual diagnosis.
// Usage: paste into DevTools or load via CDP Runtime.evaluate after bundle loads.
(function installCylinderDicerDiagnosisHarness() {
  if (window.__cdHarness) {
    return window.__cdHarness;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (predicate, timeoutMs = 15000, stepMs = 200) => {
    const started = performance.now();
    while (performance.now() - started < timeoutMs) {
      if (predicate()) {
        return true;
      }
      await sleep(stepMs);
    }
    return false;
  };

  window.__fromDefold = window.__fromDefold || [];
  window.addEventListener('CylinderDicerFromDefold', (e) => window.__fromDefold.push(e.detail));

  if (!window.__keepalive) {
    window.__keepalive = setInterval(() => {
      try {
        if (window.Module && Module.resumeMainLoop) {
          Module.resumeMainLoop();
        }
      } catch (_err) {}
    }, 400);
  }

  const send = (message) => {
    window.CylinderDicerSendToDefold(message);
  };

  const qa = (action, actorId, payload) => {
    send({
      type: 'QA_COMMAND',
      payload: {
        id: `diag-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        actor_id: actorId || 'local-player',
        action,
        payload: payload || {},
      },
    });
  };

  const lastStatus = () => {
    const rows = window.__fromDefold.filter((m) => m.type === 'QA_STATUS');
    return rows.length ? rows[rows.length - 1].payload : null;
  };

  const waitStatus = async (predicate, timeoutMs = 12000) => {
    const started = performance.now();
    while (performance.now() - started < timeoutMs) {
      const before = window.__fromDefold.filter((m) => m.type === 'QA_STATUS').length;
      qa('status');
      await waitFor(() => {
        const rows = window.__fromDefold.filter((m) => m.type === 'QA_STATUS');
        return rows.length > before;
      }, 1200, 100);
      const rows = window.__fromDefold.filter((m) => m.type === 'QA_STATUS');
      if (rows.length > 0 && predicate(rows[rows.length - 1].payload)) {
        return rows[rows.length - 1].payload;
      }
      await sleep(150);
    }
    return lastStatus();
  };

  const startMatch = () => {
    send({
      type: 'START_MATCH',
      payload: {
        sessionId: 'diag-session',
        matchId: 'diag-match',
        playerId: 'local-player',
        mode: 'dev',
        locale: 'ko',
        localSimulator: true,
        players: [
          { id: 'local-player', name: 'You', hp: 6, dice_count: 5, skin: 'rosemund' },
          { id: 'opponent-1', name: 'Hush Feather', hp: 6, dice_count: 5, skin: 'hush-feather', initial_loaded_slots: [1, 3, 5] },
          { id: 'opponent-2', name: 'Samuel Saber', hp: 6, dice_count: 5, skin: 'samuel-saber', initial_loaded_slots: [1, 3, 5] },
          { id: 'opponent-3', name: 'Zippo Jay', hp: 6, dice_count: 5, skin: 'zippo-jay', initial_loaded_slots: [1, 3, 5] },
        ],
      },
    });
  };

  const summarize = (snap) => {
    if (!snap) {
      return { error: 'no_status' };
    }
    const local = (snap.players || []).find((p) => p.is_local);
    return {
      phase: snap.phase,
      hud: snap.hud,
      turn: snap.turn && snap.turn.active_player_id,
      round_index: snap.turn && snap.turn.round_index,
      background: snap.visual && snap.visual.background,
      rail: snap.visual && snap.visual.rail,
      bidding: snap.bidding,
      bid_controls: snap.visual && snap.visual.bid_controls,
      shake: snap.visual && snap.visual.shake,
      duel: {
        data: snap.duel,
        visual: snap.visual && snap.visual.duel,
      },
      cylinder: snap.visual && snap.visual.cylinder_overlay,
      carousel: snap.visual && snap.visual.player_carousel,
      pending: snap.pending_load,
      shake_state: snap.shake,
      local_actions: local && local.available_actions,
      players: (snap.players || []).map((player) => ({
        id: player.id,
        hp: player.hp,
        bullets: player.bullets,
        eliminated: player.eliminated,
        actions: player.available_actions,
      })),
    };
  };

  const runPhaseChecks = async () => {
    const report = { started_at: new Date().toISOString(), phases: {} };

    startMatch();
    await waitFor(() => window.__fromDefold.some((m) => m.type === 'MATCH_READY'), 10000);
    await sleep(800);

    // reload (3 bullets)
    for (const slot of [2, 4, 6]) {
      qa('load', 'local-player', { slot_index: slot });
      await sleep(500);
    }
    report.phases.reload = summarize(await waitStatus((s) => s.phase === 'revolver_reload' || s.phase === 'cup_shake'));
    await sleep(900);

    // Every player owns their cup shake; the final completion opens dice check.
    qa('shake', 'local-player');
    report.phases.shake = summarize(await waitStatus((s) => s.phase === 'cup_shake'
      && Number(s.shake && s.shake.counts && s.shake.counts['local-player']) >= 6));
    await sleep(900);
    for (const actorId of ['opponent-1', 'opponent-2', 'opponent-3']) {
      qa('shake', actorId);
      await sleep(250);
    }
    await waitStatus((s) => s.phase === 'dice_check');

    // Every player confirms their own private dice.
    for (const actorId of ['local-player', 'opponent-1', 'opponent-2', 'opponent-3']) {
      qa('check', actorId);
      await sleep(200);
    }
    report.phases.dice_check = summarize(await waitStatus((s) => s.phase === 'bidding_gap'));
    await sleep(900);

    // bidding_gap -> bidding (3s)
    report.phases.bidding_gap = summarize(await waitStatus((s) => s.phase === 'bidding_gap' || s.phase === 'bidding', 6000));
    await sleep(3500);
    report.phases.bidding_local_turn = summarize(
      await waitStatus((s) => s.phase === 'bidding' && s.turn && s.turn.active_player_id === 'local-player', 8000),
    );

    qa('bid', 'local-player', { count: 1, face: 2 });
    await waitStatus((s) => s.phase === 'revolver_reload' && s.pending_load && s.pending_load.player_id === 'local-player', 5000);
    qa('load_all', 'local-player');
    await waitStatus((s) => s.phase === 'bidding' && s.turn && s.turn.active_player_id === 'opponent-1', 5000);
    qa('challenge', 'opponent-1');
    report.phases.duel_reveal = summarize(
      await waitStatus((s) => s.phase === 'duel'
        && s.duel && s.duel.phase === 'ready'
        && s.visual && s.visual.duel && s.visual.duel.mode === 'reveal'
        && s.visual.duel.all_revealed === true
        && Number(s.visual.duel.grid_count || 0) > 0
        && s.visual.background && s.visual.background.position_y === 720, 5000),
    );
    report.phases.duel_combat = summarize(
      await waitStatus((s) => s.phase === 'duel'
        && s.duel && s.duel.phase === 'executing' && s.duel.resolution
        && s.visual && s.visual.duel && s.visual.duel.mode === 'combat', 9000),
    );
    report.phases.next_round = summarize(
      await waitStatus((s) => s.turn && s.turn.round_index >= 1 && s.phase !== 'duel', 12000),
    );

    return report;
  };

  window.__cdHarness = {
    sleep,
    qa,
    send,
    lastStatus,
    waitStatus,
    summarize,
    startMatch,
    runPhaseChecks,
  };

  return window.__cdHarness;
})();
