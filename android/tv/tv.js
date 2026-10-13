/* Android-only, ten-foot UI. The game engine remains the root game.js. */
(function () {
  'use strict';
  if (!window.PongGame || !window.PongInput) throw new Error('TV host requires PongGame and PongInput');
  const game = window.PongGame, input = window.PongInput;
  game.activateExternalControls(true);
  document.body.classList.add('pong-tv');
  document.body.classList.remove('touch-mode');
  const root = document.createElement('main'); root.id = 'tv-root'; document.body.append(root);
  const hints = document.createElement('div'); hints.className = 'tv-hints'; document.body.append(hints);
  const devices = new Map();
  // Keep physical edges separate from gameplay state: changing screens clears
  // movement, but must not turn a still-held button into another menu click.
  const heldKeys = new Map();
  let profiles = {};
  try { profiles = JSON.parse(localStorage.getItem('pongTVDevices.v1')) || {}; } catch (_) { /* First launch / storage unavailable. */ }
  if (typeof profiles !== 'object' || Array.isArray(profiles)) profiles = {};
  let players = [], phase = 'home', calibrating = null, calibrationStep = 0, releaseGate = false;
  let practiceStart = null, previousTime = performance.now(), navAt = 0, navHeld = '';
  let difficulty = 'medium', duration = 180, mode = 'ai', notice = '', returnToPause = false;
  let previousProfile = null, optionalProfile = null, replacedPlayer = null, menuMusicEnabled = true;
  try { menuMusicEnabled = localStorage.getItem('pongTVMenuMusic.v1') !== 'off'; } catch (_) { /* Use the default. */ }
  const music = window.PongMenuMusic ? new window.PongMenuMusic({enabled:menuMusicEnabled && game.getSettings().soundEnabled, volume:game.getSettings().soundVolume / 100}) : null;
  let settingsOrigin = 'home', settingsSection = 'general', winCondition = 'combined';
  const steps = input.ACTIONS;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const profileKey = device => device.key || device.descriptor || [device.vendorId, device.productId, device.name].join(':');
  const disconnected = c => devices.get(c.device.id) !== c;
  const unavailable = c => disconnected(c) || !input.validProfile(c.profile);
  const actionName = c => c.profile.learned && c.profile.learned.confirm ? input.tokenLabel(c.profile.learned.confirm) : 'OK / A';
  const controllerFor = d => {
    if (!devices.has(d.id)) devices.set(d.id, new input.Controller(d, profiles[profileKey(d)]));
    const c = devices.get(d.id); c.device = d; return c;
  };
  function persist(c) {
    c.profile.verified = true; profiles[profileKey(c.device)] = c.profile;
    try { localStorage.setItem('pongTVDevices.v1', JSON.stringify(profiles)); } catch (_) { notice = 'Device setup works for this session; storage could not be saved.'; }
  }
  function clear() { devices.forEach(c => c.clear()); game.clearInput(); }
  function capture(enabled) { if (window.AndroidHost && AndroidHost.setPointerCapture) AndroidHost.setPointerCapture(enabled); }
  function syncMusic() {
    if (!music) return;
    const s = game.getSettings();
    music.setEnabled(menuMusicEnabled && s.soundEnabled); music.setVolume(s.soundVolume / 100);
    music.setActive(!['playing','paused'].includes(game.getState().state) && phase !== 'playing');
  }
  function screen(html, className = '') {
    root.innerHTML = '<section class="tv-screen ' + className + '">' + html + '</section>';
    const first = root.querySelector('button:not(:disabled)'); if (first) first.focus();
    capture(false); hints.innerHTML = ''; syncMusic();
  }
  const footer = text => '<div class="tv-footer">' + text + '</div>';
  const button = (id, title, small = '') => '<button data-do="' + id + '">' + title + (small ? '<small>' + small + '</small>' : '') + '</button>';
  const bindings = c => '<dl class="tv-bindings">' + input.controlSummary(c.profile).map(([label, value]) => '<div><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>').join('') + '</dl>';
  const playerCount = () => mode === 'aivsai' ? 0 : mode === '2p' ? 2 : 1;
  const allReady = () => players.length === playerCount() && !players.some(unavailable);
  function home() {
    phase = 'home'; clear(); game.showMenu(); returnToPause = false; previousProfile = null; optionalProfile = null; replacedPlayer = null; calibrating = null;
    screen('<div class="tv-home"><div><div class="tv-art" aria-hidden="true"><span></span><span></span></div><p class="tv-kicker">A battle for every square</p><h1>PONG WARS<span>RELOADED</span></h1><p class="tv-copy">Your couch. Your controls.<br>Day versus night.</p></div><div><div class="tv-actions">' +
      button('solo', 'One player', 'Take on the AI') + button('duo', 'Two players', 'Two devices · one screen') +
      button('watch', 'Watch a match', 'AI versus AI') + '<div class="tv-row">' + button('difficulty', 'AI: ' + difficulty) + button('duration', duration / 60 + ' minutes') + '</div>' +
      '<div class="tv-row">' + button('options', 'Settings') + button('help', 'How to play') + '</div></div></div></div>' + footer('Direction pad / sticks / arrows to choose · OK / A / Enter / click to select · Back to exit'));
  }
  function lobby() {
    phase = 'lobby'; clear();
    const count = mode === '2p' ? 2 : 1;
    screen('<p class="tv-kicker">' + (allReady() ? 'Everyone is ready' : 'Make yourself at home') + '</p><h2>' + (allReady() ? 'Your controls. Your match.' : 'Pick up your controls.') + '</h2><p class="tv-copy">' +
      (allReady() ? 'Saved buttons are shown below. Start the match, or change them now.' : 'Each player: press a button or move a stick on the device you want to use.') + '</p><div class="tv-join">' +
      Array.from({length: count}, (_, i) => '<div class="tv-slot"><strong>' + (i ? '02 / NIGHT' : '01 / DAY') + '</strong>' + (players[i] ? '<p>' + esc(players[i].device.name) + ' · Ready ✓</p>' + bindings(players[i]) + button('rebind-' + i, 'Change controls') : '<p>Press any button to join</p><p class="tv-copy">Remote · gamepad · keyboard · mouse</p>') + '</div>').join('') + '</div>' +
      (allReady() ? '<div class="tv-actions">' + button('start-match', 'Start match') + '</div>' : '') + '<p class="tv-copy tv-notice">' + esc(notice) + '</p>' + footer('Back to return · Two players need two distinct input devices'), 'tv-lobby');
    const startButton = root.querySelector('[data-do="start-match"]'); if (startButton) startButton.focus();
  }
  const stepTitles = {up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', rotateLeft: 'Rotate left', rotateRight: 'Rotate right', teleport: 'Rescue your ball'};
  function calibration(teachOptional = false) {
    const step = steps[calibrationStep], optional = calibrationStep >= 4;
    phase = optional && !teachOptional ? 'optional-buttons' : 'calibration'; practiceStart = null;
    if (phase === 'optional-buttons' && optionalProfile) {
      // Returning from an unfinished hold must not save a partly taught button
      // when the player chooses the action-button shortcut instead.
      calibrating.profile = optionalProfile; optionalProfile = null;
    }
    if (teachOptional) optionalProfile = JSON.parse(JSON.stringify(calibrating.profile));
    // Menu selection never arms the tap/hold gameplay shortcuts. Keep physical
    // keys/axes intact until released so a held input cannot pass another step.
    calibrating.rotateMode = false; calibrating.confirmAt = null; calibrating.gestureUsed = true;
    const action = esc(actionName(calibrating));
    const shortcut = step === 'teleport' ? 'Hold ' + action + ' for 2½ seconds to rescue your ball.' :
      'Tap ' + action + ' to switch to rotation, then use ' + esc(input.tokenLabel(calibrating.profile.learned[step === 'rotateLeft' ? 'left' : 'right'])) + '.';
    const help = !optional ? 'Briefly press or move the direction you want. Direction pads, sticks, keyboard keys and mouse movement all work.' :
      teachOptional ? (step === 'teleport' ? 'Hold a spare button for 2 seconds. ' : 'Press a spare button or trigger, or move the mouse wheel. ') + 'Press ' + action + ' to return to the skip choices.' :
      'A separate button is optional. Your action button already does this:<br>' + shortcut;
    const checks = steps.map((name, i) => '<span class="' + (i < calibrationStep ? 'done' : i === calibrationStep ? 'current' : '') + '"' +
      (i === calibrationStep ? ' aria-current="step"' : '') + '><b>' + (i < calibrationStep ? '✓' : i + 1) + '</b><small>' +
      (i === calibrationStep ? 'Current' : i < calibrationStep ? (i >= 4 && !calibrating.profile.learned[name] ? 'Shortcut' : 'Set') : i >= 4 ? 'Optional' : 'Move') + '</small></span>').join('');
    const choices = phase === 'optional-buttons' ? '<div class="tv-actions tv-optional-actions">' +
      button('skip-optional', 'Use action button · skip this') + button('skip-all-optional', 'Skip all remaining extras', 'Rotation and rescue still work with ' + action) +
      button('teach-optional', 'Teach a separate button') + '</div>' : '<div class="tv-progress"><div id="tv-practice-progress"></div></div><p class="tv-copy" id="tv-input-feedback">Try it now.</p>';
    screen('<div class="tv-calibration"><div><p class="tv-kicker">' + (players.indexOf(calibrating) ? 'Night' : 'Day') + ' · ' + esc(calibrating.device.name) + '</p>' +
      '<p class="tv-action-set">✓ Action button set: <strong>' + action + '</strong></p><p class="tv-step-label">Step ' + (calibrationStep + 1) + ' of 7' + (optional ? ' · Optional extra button' : ' · Movement') + '</p>' +
      '<h2>' + stepTitles[step] + '</h2><p class="tv-copy">' + help + '</p><div class="tv-checks" aria-label="Setup progress">' + checks + '</div>' + choices + '</div>' +
      '<div class="tv-demo"><div class="tv-racket" id="tv-demo-racket"></div></div></div>' +
      footer((phase === 'optional-buttons' ? 'Directions choose · ' + action + ' selects' : 'Release between steps') + ' · Back cancels setup · Only action + four directions are required'), 'tv-setup');
  }
  function advanceCalibration(skipAll = false) {
    optionalProfile = null;
    calibrationStep = skipAll ? steps.length : calibrationStep + 1; releaseGate = true;
    if (calibrationStep >= steps.length) { ready(); game.feedback('success'); }
    else { calibration(); game.feedback('confirm'); }
  }
  function chooseConfirm() {
    phase = 'confirm-key'; clear(); releaseGate = true; optionalProfile = null;
    screen('<p class="tv-kicker">' + esc(calibrating.device.name) + '</p><h2>Choose your action button.</h2><p class="tv-copy">Release the button you used to join, then press the button you want for OK.<br>Use the center button on a remote, A on a gamepad, Enter on a keyboard,<br>or the left mouse button. An unusual keyboard can use any spare key.<br><br>This button selects menus, switches movement / rotation, and rescues your ball when held.</p>' + footer('Keep four other directions available for movement · Back cancels'));
  }
  function ready() {
    phase = 'ready'; clear();
    screen('<div class="tv-device-review"><p class="tv-kicker">Controls ready · ' + esc(calibrating.device.name) + '</p><h2>You’re ready, ' + (players.indexOf(calibrating) ? 'Night.' : 'Day.') + '</h2>' + bindings(calibrating) + '<div class="tv-actions">' + button('confirm-device', 'Save controls & continue') + button('retry-device', 'Choose buttons again') + '</div></div>' + footer('Release your button, then select Save · Your settings stay on this TV.'));
  }
  function start() {
    clear(); phase = 'playing'; root.innerHTML = ''; capture(true);
    game.start({mode, difficulty, duration, winCondition}); notice = ''; returnToPause = false; syncMusic();
  }
  function paused(message) {
    phase = 'pause'; game.pause(); clear(); notice = message || '';
    const missing = !allReady();
    screen('<p class="tv-kicker">Take a breath</p><h2>' + (missing ? 'Reconnect your controls.' : 'Match paused.') + '</h2><p class="tv-copy">' + esc(notice || 'The battle can wait.') + '</p><div class="tv-actions">' +
      (missing ? '<p class="tv-copy">Press a button on the disconnected controller to reconnect, or on a replacement device to set it up.</p>' : button('resume', 'Resume match')) +
      button('controls', 'Check / change player controls') + button('options', 'Sound & display settings') + button('restart', 'Rematch') + button('home', 'Main menu') + '</div>' + footer('Back resumes when all controllers are connected. Home always returns to Google TV.'));
  }
  function resume() {
    if (!allReady()) return;
    clear(); phase = 'playing'; root.innerHTML = ''; game.resume(); capture(true); syncMusic();
  }
  function help() {
    phase = 'help'; screen('<p class="tv-kicker">Own the board</p><h2>Paint the world your color.</h2><p class="tv-copy">Deflect balls with your racket to claim squares. Reach 80% territory, or lead when time runs out.<br>Collect stars and suns for powerups. Move into a ball for a power shot.<br><br>Gamepad: sticks / direction pad to move, shoulders to rotate, hold X / Y to rescue.<br>Keyboard: arrows / WASD / IJKL, Q / E to rotate, hold T to rescue.<br>Remote: directions to move; tap OK to switch to rotation; hold OK to rescue.<br>Mouse: move to steer; wheel to rotate; hold left click to rescue.<br><br>You have three rescues per match. Back / Escape / Start / right click pauses.</p><div class="tv-actions">' + button('home', 'Let’s play') + '</div>');
  }
  function options(section = settingsSection) {
    phase = 'settings'; settingsSection = section;
    const s = game.getSettings(), locked = ['playing', 'paused'].includes(game.getState().state);
    const toggle = (key, label) => button('setting-' + key, label + ': ' + (s[key] ? 'On' : 'Off'));
    const rule = (id, label) => locked ? '<button disabled>' + label + '</button>' : button(id, label);
    let contents;
    if (section === 'rules') contents =
      rule('rule-win', 'Win: ' + winCondition) + rule('setting-freeMovement', 'Free movement: ' + (s.freeMovement ? 'On' : 'Off')) +
      rule('setting-mirroredPowerups', 'Mirrored powerups: ' + (s.mirroredPowerups ? 'On' : 'Off')) +
      rule('setting-powerupFrequency', 'Powerup every ' + s.powerupFrequency + ' seconds') +
      rule('setting-powerupDuration', 'Powerup lasts ' + s.powerupDuration + ' seconds') + button('options-general', 'Sound & display');
    else if (section === 'visuals') contents =
      toggle('screenShake', 'Screen shake') + toggle('racketOutline', 'Racket outline') + toggle('particles', 'Particles') +
      toggle('gridEffect', 'Grid lines') + toggle('progressionBar', 'Territory progress bar') + button('diagnostics', 'TV diagnostics') + button('options-general', 'Sound & display');
    else contents = toggle('soundEnabled', 'Sound') + button('menu-music', 'Menu music: ' + (menuMusicEnabled ? 'On' : 'Off')) + button('setting-soundVolume', 'Volume: ' + s.soundVolume + '%') +
      button('setting-theme', 'Color theme: ' + s.theme) + toggle('effectsEnabled', 'Visual effects') +
      '<div class="tv-row">' + button('options-visuals', 'Visual details') + button('options-rules', 'Match rules') + '</div>' + button('privacy', 'Privacy & credits');
    screen('<p class="tv-kicker">Make it yours</p><h2>' + (section === 'rules' ? 'Match rules' : section === 'visuals' ? 'Visual details' : 'Sound & display') + '</h2>' +
      (section === 'rules' && locked ? '<p class="tv-copy">Match rules can be changed from the main menu, between games.</p>' : '') +
      '<div class="tv-actions tv-settings">' + contents + button('options-back', 'Back') + '</div>' + footer('Select a setting to change it · Device mappings: pause → Check / change player controls'));
  }
  function dispatch(action) {
    // Apply settings before the cue: Sound Off is silent, while switching it
    // back on confirms the new setting. Start and Resume belong to the engine.
    let cue = 'confirm';
    if (action === 'solo' || action === 'duo') { mode = action === 'solo' ? 'ai' : '2p'; players = []; notice = ''; lobby(); }
    else if (action === 'start-match') { cue = null; if (allReady()) start(); else lobby(); }
    else if (action === 'watch') { cue = null; mode = 'aivsai'; players = []; start(); }
    else if (action === 'difficulty') { const values = ['easy', 'medium', 'hard', 'hardest']; difficulty = values[(values.indexOf(difficulty) + 1) % values.length]; home(); root.querySelector('[data-do="difficulty"]').focus(); }
    else if (action === 'duration') { duration = duration === 300 ? 60 : duration + 60; home(); root.querySelector('[data-do="duration"]').focus(); }
    else if (action === 'home') { cue = 'back'; home(); }
    else if (action === 'help') help();
    else if (action === 'diagnostics') {
      phase = 'diagnostics';
      const info = game.getDiagnostics ? game.getDiagnostics() : {}, display = info.display || {}, renderer = info.renderer || {}, audio = info.audio || {};
      const size = (width, height) => width && height ? esc(width) + ' × ' + esc(height) : 'Not reported';
      const rows = [['TV output', size(display.outputWidth, display.outputHeight)], ['App surface', size(display.windowWidth, display.windowHeight)],
        ['Game canvas', size(renderer.width, renderer.height)], ['Refresh rate', display.refreshRate ? esc(Math.round(display.refreshRate * 10) / 10) + ' Hz' : 'Not reported'],
        ['Sound backend', esc(audio.backend || 'Not reported') + (audio.ready === false ? ' · warming up' : '')]];
      screen('<div class="tv-device-review"><p class="tv-kicker">Display & audio</p><h2>TV diagnostics</h2><dl class="tv-bindings">' + rows.map(([label, value]) => '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>').join('') + '</dl>' +
        '<p class="tv-copy">The app surface is the resolution Android gives this game. It can differ from your TV’s output resolution.</p><div class="tv-actions">' + button('options-visuals', 'Back to visual details') + '</div></div>');
    }
    else if (action === 'privacy') {
      phase = 'privacy';
      screen('<p class="tv-kicker">Pong Wars Reloaded</p><h2>Private by design.</h2><p class="tv-copy">This app works offline. It does not collect or share personal data.<br>No accounts, advertising, analytics, location or Bluetooth permissions.<br><br>Your controller identifiers, button mappings and game preferences are saved locally.<br>Clear the app’s storage or uninstall it to remove them. Android backup is disabled.<br><br>Game by Erwin Mayer, based on Pong Wars by Koen van Gilst.<br>Music: Level 1 · Juhani Junkala · CC0 (public domain).<br>Source and support: github.com/mayerwin/pong-wars-reloaded</p><div class="tv-actions">' + button('options-general', 'Back to settings') + '</div>');
    }
    else if (action === 'options') { settingsOrigin = phase === 'pause' ? 'pause' : 'home'; options('general'); }
    else if (action === 'options-back') { cue = 'back'; if (settingsOrigin === 'pause') paused(); else home(); }
    else if (action.startsWith('options-')) { if (action === 'options-general') cue = 'back'; options(action.slice(8)); }
    else if (action === 'menu-music') {
      menuMusicEnabled = !menuMusicEnabled;
      try { localStorage.setItem('pongTVMenuMusic.v1', menuMusicEnabled ? 'on' : 'off'); } catch (_) { /* Keep the session preference. */ }
      options(); root.querySelector('[data-do="menu-music"]').focus();
    }
    else if (action === 'rule-win') { const values = ['combined', 'domination', 'timed']; winCondition = values[(values.indexOf(winCondition) + 1) % values.length]; options(); root.querySelector('[data-do="rule-win"]').focus(); }
    else if (action.startsWith('setting-')) {
      const key = action.slice(8), s = game.getSettings();
      const choices = {soundVolume:[0,10,20,30,40,50,60,70,80,90,100], theme:['cyber','coral','sunset'], powerupFrequency:[5,10,15,20,30,45,60], powerupDuration:[10,20,30,40,60,90,120]};
      const value = choices[key] ? choices[key][(choices[key].indexOf(s[key]) + 1) % choices[key].length] : !s[key];
      game.configure({[key]:value}); options(); const changed = root.querySelector('[data-do="' + action + '"]'); if (changed) changed.focus();
    }
    else if (action === 'resume') { cue = null; resume(); }
    else if (action === 'restart') { cue = null; if (allReady()) start(); else paused('Reconnect and check all players before a rematch.'); }
    else if (action === 'controls') {
      phase = 'choose-controls'; screen('<p class="tv-kicker">Device settings</p><h2>Your player controls.</h2><div class="tv-join">' + players.map((c, i) => '<div class="tv-slot"><strong>' + (i ? 'NIGHT · ' : 'DAY · ') + esc(c.device.name) + '</strong>' + bindings(c) + button('rebind-' + i, 'Change controls') + '</div>').join('') + '</div><div class="tv-actions">' + button('back-pause', 'Back to match') + '</div>', 'tv-lobby');
    } else if (action.startsWith('rebind-')) {
      returnToPause = phase === 'choose-controls';
      calibrating = players[Number(action.slice(7))]; if (!calibrating || disconnected(calibrating)) { if (returnToPause) paused('Reconnect this controller first.'); else lobby(); return; }
      previousProfile = JSON.parse(JSON.stringify(calibrating.profile)); replacedPlayer = null;
      calibrationStep = 0; calibrating.profile = input.profile(calibrating.device); chooseConfirm();
    } else if (action === 'back-pause') { cue = 'back'; paused(); }
    else if (action === 'retry-device') { calibrationStep = 0; calibrating.profile = input.profile(calibrating.device); chooseConfirm(); }
    else if (action === 'skip-optional' || action === 'skip-all-optional') {
      if (phase !== 'optional-buttons' || !calibrating) return;
      advanceCalibration(action === 'skip-all-optional'); cue = null;
    }
    else if (action === 'teach-optional') {
      if (phase !== 'optional-buttons' || !calibrating) return;
      releaseGate = true; calibration(true);
    }
    else if (action === 'confirm-device' && calibrating) { persist(calibrating); calibrating = null; previousProfile = null; replacedPlayer = null; const toPause = returnToPause; returnToPause = false; notice = 'Controls saved.'; if (toPause) paused(notice); else lobby(); }
    else return;
    if (cue) game.feedback(cue);
  }
  root.addEventListener('click', event => {
    const b = event.target.closest('[data-do]');
    if (b && !b.disabled) { game.unlockAudio(); if (music) music.unlock(); dispatch(b.dataset.do); }
  });
  function back() {
    if (phase === 'playing') { paused(); game.feedback('pause'); return; }
    else if (phase === 'pause') { resume(); return; }
    else if (phase === 'privacy') options('general');
    else if (phase === 'diagnostics') options('visuals');
    else if (phase === 'settings') { if (settingsOrigin === 'pause') paused(); else home(); }
    else if (phase === 'home') { if (window.AndroidHost) AndroidHost.exit(); else return; }
    else if (calibrating) {
      if (calibrating && previousProfile) calibrating.profile = previousProfile;
      else {
        if (replacedPlayer) players[replacedPlayer.index] = replacedPlayer.controller;
        else players = players.filter(c => c !== calibrating);
        calibrating.profile = input.profile(calibrating.device);
      }
      calibrating = null; previousProfile = null; replacedPlayer = null; const toPause = returnToPause; returnToPause = false;
      if (toPause) paused(); else { notice = 'Setup cancelled. Press a button to try again.'; lobby(); }
    }
    else if (phase === 'choose-controls') paused();
    else home();
    game.feedback('back');
  }
  function focusFromInput(button) {
    if (!button || button === document.activeElement) return;
    button.focus();
    if (document.activeElement === button) game.feedback('navigate');
  }
  function navigate(direction, now, fresh) {
    if (!fresh && direction === navHeld && now - navAt < 190) return;
    navHeld = direction; navAt = now;
    const buttons = [...root.querySelectorAll('button:not(:disabled)')];
    if (!buttons.length) return;
    const active = document.activeElement, rect = active && active.getBoundingClientRect();
    if (!buttons.includes(active)) { focusFromInput(buttons[0]); return; }
    const dx = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
    const dy = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
    let best = null, cost = Infinity;
    for (const b of buttons) {
      if (b === active) continue;
      const r = b.getBoundingClientRect(), x = (r.left + r.right - rect.left - rect.right) / 2, y = (r.top + r.bottom - rect.top - rect.bottom) / 2;
      const along = x * dx + y * dy, across = Math.abs(x * dy - y * dx);
      if (along > 2 && along + across * 3 < cost) { best = b; cost = along + across * 3; }
    }
    focusFromInput(best);
  }
  function join(c) {
    if (players.includes(c) || players.length >= (mode === '2p' ? 2 : 1)) return;
    players.push(c); c.clear();
    if (input.validProfile(c.profile)) { lobby(); game.feedback('success'); }
    else { calibrating = c; previousProfile = null; replacedPlayer = null; returnToPause = false; calibrationStep = 0; chooseConfirm(); game.feedback('confirm'); }
  }
  function meaningful(e) { return (e.type === 'key' && e.action === 'down' && !e.repeat) || !!input.tokenFor(e); }
  function onInput(e) {
    const now = performance.now();
    if (e.type === 'lifecycle') {
      clear(); heldKeys.clear();
      game.setFeedbackActive(e.action !== 'pause');
      if (e.action === 'pause') { if (phase === 'playing' || game.getState().state === 'playing') paused('Paused while the app was away.'); if (music) music.suspend(); }
      else if (music) { syncMusic(); music.resume(); }
      return;
    }
    if (e.type === 'device') {
      if (e.action === 'disconnected') {
        const lost = devices.get(e.device.id); devices.delete(e.device.id); heldKeys.delete(e.device.id);
        if (lost && players.includes(lost)) {
          if (calibrating) calibrating.profile = previousProfile || input.profile(calibrating.device);
          if (replacedPlayer) players[replacedPlayer.index] = replacedPlayer.controller;
          calibrating = null; previousProfile = null; replacedPlayer = null; returnToPause = false;
          if (['playing', 'paused'].includes(game.getState().state)) paused(lost.device.name + ' disconnected.');
          else { players = players.filter(c => c !== lost && input.validProfile(c.profile)); notice = 'A controller disconnected. Press a button to join again.'; if (phase !== 'home') lobby(); }
        }
      } else controllerFor(e.device);
      return;
    }
    if (!e.device) return;
    if (meaningful(e)) { game.unlockAudio(); if (music) music.unlock(); }
    const c = controllerFor(e.device);
    if (!heldKeys.has(e.device.id)) heldKeys.set(e.device.id, new Set());
    const held = heldKeys.get(e.device.id), wasDown = e.type === 'key' && held.has(e.code);
    if (e.type === 'key') { if (e.action === 'down') held.add(e.code); else held.delete(e.code); }
    // A key held while Start/Resume cleared game input belongs to the old
    // screen until released. Native repeat events must not re-arm its hold.
    if (!(e.type === 'key' && e.action === 'down' && wasDown && !c.keys.has(e.code))) c.ingest(e, now);
    if (e.type === 'motion' && e.pointer && phase !== 'playing' && phase !== 'calibration' && (phase !== 'optional-buttons' || c === calibrating)) {
      const pointed = document.elementFromPoint(e.pointer.x * innerWidth, e.pointer.y * innerHeight);
      const target = pointed && pointed.closest('#tv-root button:not(:disabled)');
      focusFromInput(target);
    }
    const down = e.type === 'key' && e.action === 'down' && !wasDown && !e.repeat;
    if (down && ['BACK', 'ESCAPE', 'BUTTON_B', 'MOUSE_BACK'].includes(e.code)) { back(); return; }
    if (down && phase !== 'playing' && phase !== 'lobby' && ['MOUSE_SECONDARY', 'BUTTON_START'].includes(e.code)) { back(); return; }
    if (phase === 'optional-buttons' && c !== calibrating) return;
    if (phase === 'lobby') {
      if (!players.includes(c) && (down || (e.type === 'motion' && meaningful(e)))) {
        join(c);
        if (phase === 'confirm-key') c.ingest(e, now);
        return;
      }
      if (!players.includes(c)) return;
    }
    if (phase === 'pause' && (down || (e.type === 'motion' && meaningful(e)))) {
      const missing = players.findIndex(disconnected);
      if (missing >= 0 && !players.includes(c)) {
        const oldPlayer = players[missing];
        players[missing] = c; clear();
        if (input.validProfile(c.profile)) { paused('Controller reconnected. Select Resume when ready.'); game.feedback('success'); }
        else { replacedPlayer = {index:missing, controller:oldPlayer}; previousProfile = null; calibrating = c; calibrationStep = 0; returnToPause = true; chooseConfirm(); c.ingest(e, now); game.feedback('confirm'); }
        return;
      }
    }
    if (phase === 'playing') {
      if (down && c.profile.bindings.pause.includes(e.code)) { paused(); game.feedback('pause'); }
      else if (players.includes(c)) game.setInput(players.indexOf(c), c.sample(now));
      return;
    }
    if (phase === 'confirm-key') {
      if (c !== calibrating) return;
      if (releaseGate) {
        if (e.action === 'up' || (e.type === 'motion' && !input.tokenFor(e))) releaseGate = false;
        return;
      }
      if (down && !c.profile.bindings.pause.includes(e.code)) {
        input.setConfirm(c.profile, e.code);
        c.confirmAt = null; c.gestureUsed = true; c.rotateMode = false;
        releaseGate = true; calibration(); game.feedback('confirm');
      }
      return;
    }
    if (phase === 'calibration') {
      if (c !== calibrating) return;
      if (releaseGate) { if (e.action === 'up' && c.isIdle(now) && !held.size) releaseGate = false; return; }
      if (calibrationStep >= 4 && down && c.profile.bindings.confirm.includes(e.code)) {
        releaseGate = true; calibration(); game.feedback('back'); return;
      }
      // Learn arbitrary directional keys/axes. Keep confirm and Back available for the remote scheme.
      input.learn(c.profile, steps[calibrationStep], e, steps.slice(0, calibrationStep));
      return;
    }
    if (phase === 'optional-buttons' && releaseGate) { if (e.action === 'up' && c.isIdle(now) && !held.size) releaseGate = false; return; }
    if (phase === 'ready' && c !== calibrating) return;
    if (down && (c.profile.bindings.confirm.includes(e.code) || (phase === 'home' && !Object.values(c.profile.bindings).some(tokens => tokens.includes(e.code))))) { const b = document.activeElement; if (b && root.contains(b)) b.click(); return; }
    if (e.type === 'key' && e.action === 'down') {
      const dir = ['up', 'down', 'left', 'right'].find(a => c.profile.bindings[a].includes(e.code));
      if (dir) navigate(dir, now, down);
      else if (e.code === 'TAB') navigate('down', now, down);
    }
  }
  window.PongAndroid = {onInput};
  function frame(now) {
    const dt = Math.min(50, now - previousTime); previousTime = now;
    if (phase === 'playing') {
      players.forEach((c, i) => game.setInput(i, c.sample(now)));
      const state = game.getState();
      if (state.state === 'gameover') {
        phase = 'result'; clear();
        const text = state.winner === 'day' ? 'Day takes the world.' : state.winner === 'night' ? 'Night takes the world.' : 'Perfectly balanced.';
        screen('<p class="tv-kicker">Match complete</p><h2>' + text + '</h2><p class="tv-copy">Day ' + state.scores.day + ' · Night ' + state.scores.night + '</p><div class="tv-actions">' + button('restart', 'Play again') + button('home', 'Main menu') + '</div>');
      } else {
        const text = players.map((c, i) => '<span>' + (i ? 'NIGHT' : 'DAY') + ' · ' + (c.rotateMode ? 'ROTATE · tap ' + esc(actionName(c)) + ' to move' : 'MOVE · tap ' + esc(actionName(c)) + ' to rotate') + '<br>Hold ' + esc(actionName(c)) + ': rescue · Back: pause</span>').join('');
        if (hints.innerHTML !== text) hints.innerHTML = text;
      }
    } else if (phase === 'confirm-key' && calibrating) {
      if (releaseGate && calibrating.isIdle(now) && !(heldKeys.get(calibrating.device.id) || new Set()).size) releaseGate = false;
    } else if (phase === 'calibration' && calibrating) {
      const s = calibrating.sample(now), step = steps[calibrationStep];
      if (releaseGate && calibrating.isIdle(now) && !(heldKeys.get(calibrating.device.id) || new Set()).size) releaseGate = false;
      const active = step === 'up' ? s.y < -.2 : step === 'down' ? s.y > .2 : step === 'left' ? s.x < -.2 : step === 'right' ? s.x > .2 : !!calibrating.profile.learned[step] && s[step];
      const feedback = document.getElementById('tv-input-feedback');
      if (feedback) feedback.textContent = releaseGate ? 'Release your controls to continue.' : calibrationStep >= 4 ? 'Listening for a separate button · ' + actionName(calibrating) + ' returns to skip choices.' : 'Listening for ' + stepTitles[step].toLowerCase() + '…';
      const racket = document.getElementById('tv-demo-racket');
      if (racket) racket.style.transform = 'translate(' + s.x * 45 + 'px,' + s.y * 45 + 'px) rotate(' + (s.rotateLeft ? -45 : s.rotateRight ? 45 : 0) + 'deg)';
      if (active && !releaseGate) {
        if (practiceStart === null) practiceStart = now;
        const elapsed = now - practiceStart, needed = step === 'teleport' ? 2000 : 0;
        const progress = document.getElementById('tv-practice-progress'); if (progress) progress.style.width = (needed ? Math.min(100, elapsed / needed * 100) : 100) + '%';
        if (elapsed >= needed) {
          advanceCalibration();
        }
      } else { practiceStart = null; const progress = document.getElementById('tv-practice-progress'); if (progress) progress.style.width = '0'; }
    } else {
      if (phase === 'optional-buttons' && releaseGate && calibrating.isIdle(now) && !(heldKeys.get(calibrating.device.id) || new Set()).size) releaseGate = false;
      devices.forEach(c => {
        if (phase === 'optional-buttons' && (c !== calibrating || releaseGate)) return;
        const a = c.axes || {}, x = Math.abs(a.hatX || 0) > .5 ? a.hatX : a.x || a.z || 0, y = Math.abs(a.hatY || 0) > .5 ? a.hatY : a.y || a.rz || 0;
        if (Math.max(Math.abs(x), Math.abs(y)) > .55) navigate(Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down'), now, false);
      });
    }
    requestAnimationFrame(frame);
  }
  home(); requestAnimationFrame(frame);
  if (window.AndroidHost) AndroidHost.ready();
  else {
    // Explicit preview only: never loaded by the public web game.
    const d = {id: 'preview-keyboard', key: 'preview-keyboard', name: 'Preview keyboard'};
    const codes = {ArrowUp:'DPAD_UP', ArrowDown:'DPAD_DOWN', ArrowLeft:'DPAD_LEFT', ArrowRight:'DPAD_RIGHT', Enter:'ENTER', ' ':'SPACE', Escape:'ESCAPE', ',':'COMMA', '.':'PERIOD'};
    for (const type of ['keydown', 'keyup']) window.addEventListener(type, e => {
      e.preventDefault(); onInput({type:'key', device:d, action:type === 'keydown' ? 'down' : 'up', code:codes[e.key] || e.key.toUpperCase(), repeat:e.repeat});
    });
  }
  window.addEventListener('blur', () => { clear(); heldKeys.clear(); if (phase === 'playing') paused('Paused when focus moved away.'); if (music) music.suspend(); });
  window.addEventListener('focus', () => { if (music) { syncMusic(); music.resume(); } });
  document.addEventListener('visibilitychange', () => { if (music) { if (document.hidden) music.suspend(); else { syncMusic(); music.resume(); } } });
  window.addEventListener('pagehide', () => { if (music) music.suspend(); });
})();
