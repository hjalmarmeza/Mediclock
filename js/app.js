// Variables globales
let meds = JSON.parse(localStorage.getItem('medsMC2') || '{}');
let foto = '';
let alarmaOn = false;
let medsActuales = [];
let horaActual = '';
let intervalo = null;
let audioCtx = null;
let pestañaActual = 'nuevo';
let medColors = {};
let editingTimeData = null;
let checkInterval = null;
let wakeLock = null;
const SILENCE_URL = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAARKwAARKwAAAEAAABkYXRhAgAAAAAA';

const $ = id => document.getElementById(id);
const upper = t => t ? t.toString().toUpperCase().trim() : '';

// Definiciones explícitas de UI para evitar ReferenceErrors
const nombre = $('nombre'), paciente = $('paciente'), cant = $('cant'), hora = $('hora'), lista = $('lista'), empty = $('empty');
const sonidoOn = $('sonidoOn'), vozOn = $('vozOn'), volSlider = $('volSlider'), volValue = $('volValue');
const alertModal = $('alertModal'), detailModal = $('detailModal'), editTimeModal = $('editTimeModal'), calModal = $('calModal'), addTimeModal = $('addTimeModal');
const photoZone = $('photoZone'), photoPreview = $('photoPreview');

// CORRECCIÓN 1: Sistema de alarmas mejorado
function initializeAlarmSystem() {
    console.log('🔔 Inicializando sistema de alarmas mejorado...');
    showToast('🚀 Sistema Activo', 'Vigilando tus medicamentos cada 10s', 'info');

    requestNotificationPermissions();
    setupBackgroundSync();

    if ($('bgModeOn').checked) {
        startSilentAudio();
    }

    checkAlarms();
    if (checkInterval) clearInterval(checkInterval);
    checkInterval = setInterval(checkAlarms, 10000); // Más frecuente: cada 10 segundos

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('click', handleUserInteraction);
}


async function startSilentAudio() {
    const silent = $('silentAudio');
    if (!silent) return;

    // Usar un audio real de 10s para evitar que el sistema lo suspenda
    silent.src = 'https://raw.githubusercontent.com/anars/blank-audio/master/10-seconds-of-silence.mp3';
    silent.loop = true;
    try {
        await silent.play();
        console.log('🎧 Protección de segundo plano: Activada');

        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: 'MediClock Activo',
                artist: 'Protección de Alarmas',
                album: 'Sistema de Salud',
                artwork: [{ src: 'https://cdn-icons-png.flaticon.com/512/1237/1237460.png', sizes: '512x512', type: 'image/png' }]
            });

            navigator.mediaSession.playbackState = 'playing';

            // Impedimos que el sistema pause el audio de protección
            const actionHandlers = [
                ['play', () => { if ($('bgModeOn').checked) silent.play(); }],
                ['pause', () => { if ($('bgModeOn').checked) silent.play(); }],
                ['stop', () => { if ($('bgModeOn').checked) silent.play(); }],
            ];

            actionHandlers.forEach(([action, handler]) => {
                try { navigator.mediaSession.setActionHandler(action, handler); } catch (e) { }
            });
        }
    } catch (e) {
        console.warn('⚠️ Requiere interacción para activar segundo plano:', e);
    }
}


function stopSilentAudio() {
    const silent = $('silentAudio');
    if (silent) {
        silent.pause();
        console.log('🎧 Modo segundo plano: Audio desactivado');
    }
}

function setupBackgroundSync() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready.then(registration => {
            registration.sync.register('alarm-check').then(() => {
                console.log('🔄 Background Sync registrado');
            }).catch(err => {
                console.log('❌ Background Sync no disponible:', err);
            });
        });
    }
}

function handleVisibilityChange() {
    if (!document.hidden) {
        // Cuando la app vuelve a ser visible, verificar alarmas inmediatamente
        checkAlarms();
    }
}

function handleUserInteraction() {
    // Esta función se ejecuta cuando el usuario interactúa
    // Ayuda a desbloquear el audio
    if (medsActuales.length > 0 && alarmaOn) {
        playAlarmSound();
    }

    // También intentar iniciar el audio de silencio si estaba pendiente
    if ($('bgModeOn').checked) {
        const silent = $('silentAudio');
        if (silent && silent.paused) {
            startSilentAudio();
        }
    }
}

function requestNotificationPermissions() {
    if ('Notification' in window) {
        if (Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                console.log('🔔 Permiso de notificaciones:', permission);
            });
        }
    }

    // Solicitar permisos de audio también
    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => {
            playAlarmSound();
        });
    }
}

function checkAlarms() {
    const now = new Date();
    const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    // Log visible para depuración
    console.log("⏱️ Verificando:", currentTime);

    medsActuales = [];
    let alarmTriggered = false;

    Object.keys(meds).forEach(id => {
        const m = meds[id];
        if (!m || !m.horas) return;

        m.horas.forEach(h => {
            if (currentTime === h.h) {
                const yaAgregado = medsActuales.some(med => med.id === id);
                if (!yaAgregado) {
                    medsActuales.push({
                        id: id,
                        paciente: m.paciente,
                        nombre: m.nombre,
                        cantidad: h.cant,
                        foto: m.foto
                    });
                    alarmTriggered = true;
                }
            }
        });
    });

    if (alarmTriggered && medsActuales.length > 0) {
        // Evitar que suene varias veces en el mismo minuto
        const key = 'alarm_' + currentTime;
        if (sessionStorage.getItem(key)) return;

        sessionStorage.setItem(key, 'true');
        horaActual = currentTime;

        console.log("🚨 ACTIVANDO ALARMA:", currentTime);

        // Notificar al sistema
        showLockScreenNotification();

        // Mostrar visualmente
        if (alertModal) {
            alertModal.classList.add('open');
            showAlert();
        }
    }
}


function getMinutesDifference(time1, time2) {
    const [h1, m1] = time1.split(':').map(Number);
    const [h2, m2] = time2.split(':').map(Number);
    return (h1 * 60 + m1) - (h2 * 60 + m2);
}

function showLockScreenNotification() {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
        console.log('⚠️ SW no disponible para notificación de bloqueo');
        return;
    }

    try {
        const pacientes = [...new Set(medsActuales.map(m => m.paciente))];
        let title = '⏰ MediClock - Hora de medicación';
        let body = `Hola. Es hora de tomar tu medicación.`;

        if (pacientes.length === 1) {
            title = `⏰ Alarma para ${upper(pacientes[0])}`;
        }

        // Enviar mensaje al Service Worker para que él muestre la notificación
        navigator.serviceWorker.controller.postMessage({
            type: 'TRIGGER_ALARM',
            title: title,
            body: body,
            time: horaActual,
            meds: medsActuales
        });

        // Intentar sonido forzado local también
        if (sonidoOn.checked) {
            setTimeout(() => {
                playAlarmSoundForced();
            }, 1000);
        }
    } catch (error) {
        console.error('Error enviando notificación al SW:', error);
    }
}

function playAlarmSoundForced() {
    try {
        console.log('🔊 Forzando sonido de alarma...');

        // Crear audio en contexto de usuario
        const audio = new Audio();
        audio.src = 'https://assets.mixkit.co/sfx/preview/mixkit-alarm-digital-clock-beep-989.mp3';
        audio.volume = parseFloat(volSlider.value);
        audio.loop = false;

        // Configurar para reproducción en segundo plano
        audio.setAttribute('data-alarm', 'true');

        // Intentar reproducir inmediatamente
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(e => {
                console.log('⚠️ Error en reproducción forzada:', e);
            });
        }
    } catch (error) {
        console.error('❌ Error en sonido forzado:', error);
    }
}

// CORRECCIÓN 2: Sonido de alarma mejorado
function playAlarmSound() {
    if (!sonidoOn.checked || alarmaOn) return;

    console.log('🔊 Reproduciendo sonido de alarma mejorado...');

    stopAlarm();

    try {
        // Usar el elemento audio existente
        const audio = $('audio');
        if (audio) {
            // Cambiar la fuente a un sonido más confiable
            audio.src = 'https://assets.mixkit.co/sfx/download/mixkit-digital-alarm-buzzer-992.wav';
            audio.volume = parseFloat(volSlider.value);
            audio.loop = true;

            // Configurar metadatos para reproducción en segundo plano
            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: 'Alarma MediClock',
                    artist: 'Sistema de medicación',
                    artwork: [
                        { src: 'https://cdn-icons-png.flaticon.com/512/1237/1237460.png', sizes: '512x512', type: 'image/png' }
                    ]
                });
            }

            // Intentar reproducir con manejo de promesa mejorado
            const playAudio = () => {
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        console.log('✅ Sonido de alarma iniciado');
                        alarmaOn = true;
                    }).catch(error => {
                        console.log('⚠️ Audio necesita interacción del usuario:', error);
                        // No agregar listener aquí para evitar duplicados
                    });
                }
            };

            // Intentar inmediatamente
            playAudio();

            // También intentar con un pequeño retraso
            setTimeout(playAudio, 100);
            return;
        }

        // Fallback a Web Audio API
        if (window.AudioContext || window.webkitAudioContext) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContext();

            function playBeep() {
                if (!alarmaOn || !audioCtx) return;

                try {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();

                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
                    osc.frequency.setValueAtTime(440, audioCtx.currentTime + 0.2);

                    gain.gain.setValueAtTime(parseFloat(volSlider.value), audioCtx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

                    osc.connect(gain);
                    gain.connect(audioCtx.destination);

                    osc.start();
                    osc.stop(audioCtx.currentTime + 0.5);
                } catch (e) {
                    console.error('Error en beep:', e);
                }
            }

            alarmaOn = true;
            playBeep();

            if (intervalo) clearInterval(intervalo);
            intervalo = setInterval(playBeep, 1000); // Sonido cada segundo
        }
    } catch (error) {
        console.error('❌ Error reproduciendo sonido:', error);
        // Intentar método alternativo
        tryPlayAlternativeSound();
    }
}

function tryPlayAlternativeSound() {
    console.log('🔄 Intentando método alternativo de sonido...');

    // Crear múltiples elementos de audio para mayor compatibilidad
    const audioElements = [];

    for (let i = 0; i < 3; i++) {
        const audio = new Audio();
        audio.src = 'https://assets.mixkit.co/sfx/preview/mixkit-alarm-digital-clock-beep-989.mp3';
        audio.volume = parseFloat(volSlider.value) * 0.5;
        audio.loop = false;
        audioElements.push(audio);

        // Intentar reproducir cada uno con un pequeño retraso
        setTimeout(() => {
            audio.play().catch(e => console.log('Audio alternativo falló'));
        }, i * 200);
    }

    alarmaOn = true;

    // Configurar intervalo para repetir
    if (intervalo) clearInterval(intervalo);
    intervalo = setInterval(() => {
        audioElements.forEach(audio => {
            audio.currentTime = 0;
            audio.play().catch(() => { });
        });
    }, 3000);
}

function stopAlarm() {
    alarmaOn = false;

    if (intervalo) {
        clearInterval(intervalo);
        intervalo = null;
    }

    if (audioCtx) {
        audioCtx.close().catch(() => { });
        audioCtx = null;
    }

    const audio = $('audio');
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
    }

    // Detener todos los elementos de audio alternativos
    document.querySelectorAll('audio[data-alarm]').forEach(a => {
        a.pause();
        a.currentTime = 0;
    });

    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
    }
}

// CORRECCIÓN 3: Voz mejorada con manejo de espera
async function playVoiceReminder() {
    if (!vozOn.checked || !('speechSynthesis' in window)) return;

    // Cancelar cualquier voz previa
    speechSynthesis.cancel();

    const pacientes = [...new Set(medsActuales.map(m => m.paciente))];
    let msg = `Son las ${horaActual}. `;

    if (pacientes.length === 1) {
        const paciente = pacientes[0];
        const medicamentos = medsActuales.filter(m => m.paciente === paciente);

        if (medicamentos.length === 1) {
            msg += `${upper(paciente)}, te toca tomar ${medicamentos[0].nombre}, ${medicamentos[0].cantidad} ${medicamentos[0].cantidad === 1 ? 'pastilla' : 'pastillas'}.`;
        } else {
            msg += `${upper(paciente)}, te tocan ${medicamentos.length} medicamentos: `;
            msg += medicamentos.map((med, index) => {
                const connector = index === medicamentos.length - 1 ? ' y ' :
                    index === 0 ? '' : ', ';
                return `${connector}${med.nombre}, ${med.cantidad} ${med.cantidad === 1 ? 'pastilla' : 'pastillas'}`;
            }).join('') + '.';
        }
    } else {
        msg += 'Atención, es hora de medicación para ';
        msg += pacientes.map((paciente, index) => {
            const medicamentos = medsActuales.filter(m => m.paciente === paciente);
            const connector = index === pacientes.length - 1 ? ' y ' :
                index === 0 ? '' : ', ';

            if (medicamentos.length === 1) {
                return `${connector}${paciente}: ${medicamentos[0].nombre}, ${medicamentos[0].cantidad} ${medicamentos[0].cantidad === 1 ? 'pastilla' : 'pastillas'}`;
            } else {
                const medicamentosStr = medicamentos.map(med =>
                    `${med.nombre}, ${med.cantidad} ${med.cantidad === 1 ? 'pastilla' : 'pastillas'}`)
                    .join(' y ');
                return `${connector}${paciente}: ${medicamentosStr}`;
            }
        }).join('') + '.';
    }

    return new Promise(resolve => {
        const u = new SpeechSynthesisUtterance(msg);
        u.lang = 'es-ES';
        u.rate = 0.9;
        u.volume = parseFloat(volSlider.value);
        u.onend = () => {
            console.log('🗣️ Voz finalizada');
            // Iniciar sonido inmediatamente después de la voz
            setTimeout(() => {
                if (sonidoOn.checked) {
                    playAlarmSound();
                }
                resolve();
            }, 500);
        };
        u.onerror = (e) => {
            console.error('❌ Error en voz:', e);
            // Iniciar sonido incluso si hay error en la voz
            if (sonidoOn.checked) {
                playAlarmSound();
            }
            resolve();
        };

        // Pequeño retraso antes de iniciar la voz
        setTimeout(() => {
            try {
                speechSynthesis.speak(u);
            } catch (e) {
                console.error('Error al iniciar voz:', e);
                resolve();
            }
        }, 300);
    });
}

// CORRECCIÓN 4: Ventana de alerta con usuario visible
function showAlert() {
    if (!medsActuales.length) return;

    const pacientes = [...new Set(medsActuales.map(m => m.paciente))];

    // Saludo según número de pacientes
    if (pacientes.length === 1) {
        $('alertGreeting').textContent = `Hola ${upper(pacientes[0])}`;
    } else {
        $('alertGreeting').textContent = 'Hola a todos';
    }

    $('alertTimeDisplay').textContent = horaActual;

    const alertMedicationsList = $('alertMedicationsList');
    alertMedicationsList.innerHTML = '';

    medsActuales.forEach(med => {
        const medElement = document.createElement('div');
        medElement.className = 'alert-medication-container';
        medElement.innerHTML = `
                    <div class="alert-medication-header">
                        <div class="alert-medication-name" title="${upper(med.nombre)}">${upper(med.nombre)}</div>
                        <div class="alert-medication-patient">${upper(med.paciente)}</div>
                    </div>
                    <img class="alert-medication-img" src="${med.foto || 'https://cdn-icons-png.flaticon.com/512/1237/1237460.png'}" alt="${med.nombre}" onerror="this.src='https://cdn-icons-png.flaticon.com/512/1237/1237460.png'">
                    <div class="alert-medication-qty">${med.cantidad} ${med.cantidad === 1 ? 'pastilla' : 'pastillas'}</div>
                `;
        alertMedicationsList.appendChild(medElement);
    });

    const total = medsActuales.reduce((s, m) => s + m.cantidad, 0);
    $('alertTotal').textContent = `Total: ${medsActuales.length} medicamento${medsActuales.length > 1 ? 's' : ''} (${total} unidades)`;

    alertModal.classList.add('open');

    // Activar alarma después de mostrar la alerta
    activateAlarm();
}

async function activateAlarm() {
    console.log('🔔 Activando sistema de alerta dual...');
    alarmaOn = true;

    // Ejecutar voz y sonido de forma inteligente
    if (vozOn.checked) {
        playVoiceReminder();
    }

    // Si el sonido está activo, lanzarlo tras un pequeño delay 
    // Esto asegura que suene aunque la voz falle o se bloquee
    if (sonidoOn.checked) {
        setTimeout(() => {
            if (alarmaOn) playAlarmSound();
        }, vozOn.checked ? 2000 : 0);
    }

    if ('vibrate' in navigator) {
        navigator.vibrate([500, 200, 500, 200, 500, 200, 1000]);
    }

    window.focus();
}


function setupTimeChipListeners(li, id, m) {
    li.querySelectorAll('.time-chip').forEach(chip => {
        chip.addEventListener('click', function (e) {
            e.stopPropagation();
            openEditTimeModal(id, this.dataset.h, this.dataset.cant);
        });
    });
}

function openEditTimeModal(medId, horaValue, cantidad) {
    const m = meds[medId];
    if (!m) return;

    editingTimeData = {
        medId: medId,
        oldHora: horaValue,
        oldCantidad: cantidad
    };

    $('editTimeMedName').textContent = upper(m.nombre);
    $('editHora').value = horaValue;
    $('editCant').value = cantidad;

    editTimeModal.classList.add('open');
}

function getMedColor(medName) {
    if (!medColors[medName]) {
        const colors = ['color-1', 'color-2', 'color-3', 'color-4', 'color-5', 'color-6'];
        const index = Object.keys(medColors).length % colors.length;
        medColors[medName] = colors[index];
    }
    return medColors[medName];
}

function render() {
    lista.innerHTML = '';
    const keys = Object.keys(meds);
    empty.style.display = keys.length ? 'none' : 'block';

    keys.forEach(id => {
        const m = meds[id];
        const colorClass = getMedColor(m.nombre);

        const li = document.createElement('li');
        li.className = 'med-item';
        li.dataset.id = id;
        li.style.borderLeft = `3px solid var(--${colorClass.split('-')[1]})`;

        li.innerHTML = `
                    ${m.foto
                ? `<img class="med-avatar" src="${m.foto}" alt="${m.nombre}" onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23000%22/><text x=%2250%22 y=%2255%22 font-size=%2224%22 text-anchor=%22middle%22 fill=%22%23fff%22>💊</text></svg>';">`
                : `<div class="med-placeholder ${colorClass}">💊</div>`
            }
                    <div class="med-info">
                        <div class="med-name-row">
                            <div class="med-name" title="${upper(m.nombre)}">${upper(m.nombre)}</div>
                            <div class="med-patient">${upper(m.paciente)}</div>
                        </div>
                        <div class="med-times">
                            ${m.horas.map(h => `
                                <span class="time-chip ${colorClass}" data-h="${h.h}" data-cant="${h.cant}">
                                    ${h.h} · ${h.cant}u
                                </span>
                            `).join('')}
                            <button class="add-time-btn" data-id="${id}">+</button>
                        </div>
                    </div>
                    <div class="med-actions">
                        <button class="med-delete" data-id="${id}">🗑️</button>
                    </div>
                `;

        li.onclick = e => {
            if (e.target.classList.contains('med-delete') ||
                e.target.classList.contains('add-time-btn') ||
                e.target.classList.contains('time-chip')) return;
            showDetail(id);
        };

        li.querySelector('.med-delete').onclick = e => {
            e.stopPropagation();
            if (confirm('¿Eliminar este medicamento?')) {
                delete meds[id];
                save();
                render();
                showToast('✅ Medicamento eliminado', 'El medicamento ha sido eliminado', 'success');
            }
        };

        li.querySelector('.add-time-btn').onclick = e => {
            e.stopPropagation();
            currentMedForAddTime = id;
            $('addTimeMedName').textContent = upper(m.nombre);
            $('newHora').value = '';
            $('newCant').value = '1';
            addTimeModal.classList.add('open');
        };

        setupTimeChipListeners(li, id, m);
        lista.appendChild(li);
    });
}

function showDetail(id) {
    const m = meds[id];
    if (!m) return;

    $('detailPatient').textContent = upper(m.paciente);
    $('detailName').textContent = upper(m.nombre);
    $('detailMainImg').src = m.foto || 'https://cdn-icons-png.flaticon.com/512/1237/1237460.png';

    $('detailTimes').innerHTML = m.horas.map(h => `
                <div class="detail-time-item" data-h="${h.h}" data-cant="${h.cant}">
                    <span class="detail-time-hour">${h.h}</span>
                    <span class="detail-time-qty">${h.cant} ${h.cant === 1 ? 'unidad' : 'unidades'}</span>
                </div>
            `).join('');

    $('detailTimes').querySelectorAll('.detail-time-item').forEach(item => {
        item.addEventListener('click', function (e) {
            e.stopPropagation();
            openEditTimeModal(id, this.dataset.h, this.dataset.cant);
        });
    });

    detailModal.classList.add('open');
}

function cambiarPestaña(nombrePestaña) {
    pestañaActual = nombrePestaña;

    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    $(`tabContent${nombrePestaña.charAt(0).toUpperCase() + nombrePestaña.slice(1)}`).classList.add('active');

    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === nombrePestaña) {
            tab.classList.add('active');
        }
    });

    if (nombrePestaña === 'medicamentos') {
        render();
    }
}

function save() {
    localStorage.setItem('medsMC2', JSON.stringify(meds));
}

function saveConfig() {
    localStorage.setItem('mcConfig', JSON.stringify({
        sound: sonidoOn.checked,
        voice: vozOn.checked,
        bgMode: $('bgModeOn').checked,
        vol: parseFloat(volSlider.value)
    }));
}

function loadConfig() {
    const c = JSON.parse(localStorage.getItem('mcConfig') || '{}');
    if (c.sound !== undefined) sonidoOn.checked = c.sound;
    if (c.voice !== undefined) vozOn.checked = c.voice;
    if (c.bgMode !== undefined) $('bgModeOn').checked = c.bgMode;
    if (c.vol !== undefined) {
        volSlider.value = c.vol;
        volValue.textContent = Math.round(c.vol * 100) + '%';
    }
}

function showToast(titulo, mensaje, tipo = 'info') {
    const toast = document.createElement('div');
    const color = tipo === 'info' ? 'var(--neon-violet)' :
        tipo === 'success' ? 'var(--neon-green)' : 'var(--neon-orange)';

    toast.style.cssText = `
                position: fixed;
                top: 100px;
                left: 50%;
                transform: translateX(-50%);
                background: linear-gradient(135deg, ${color}, rgba(139, 92, 246, 0.9));
                color: white;
                padding: 1rem 1.5rem;
                border-radius: 16px;
                font-weight: 600;
                z-index: 9999;
                box-shadow: 0 0 40px rgba(139, 92, 246, 0.4);
                animation: toastIn 0.4s ease;
                font-size: 0.9rem;
                border: 1px solid rgba(255, 255, 255, 0.3);
                text-align: center;
                max-width: 85%;
                backdrop-filter: blur(10px);
            `;
    toast.innerHTML = `<strong>${titulo}</strong><br><small>${mensaje}</small>`;
    toast.id = 'toast-' + Date.now();

    const existing = document.querySelector('[id^="toast-"]');
    if (existing) existing.remove();

    document.body.appendChild(toast);
    setTimeout(() => {
        const t = document.getElementById(toast.id);
        if (t) {
            t.style.animation = 'toastOut 0.4s ease forwards';
            setTimeout(() => t.remove(), 400);
        }
    }, 3000);
}

window.onload = function () {
    loadConfig();
    render();

    Object.values(meds).forEach(m => {
        getMedColor(m.nombre);
    });

    const today = new Date().toLocaleDateString('en-CA');
    const fired = JSON.parse(localStorage.getItem('alarmsToday') || '{}');
    const filtered = {};

    Object.keys(fired).forEach(k => {
        if (k.startsWith(today)) filtered[k] = true;
    });

    localStorage.setItem('alarmsToday', JSON.stringify(filtered));

    initializeAlarmSystem();

    console.log('✅ MediClock Neo mejorado iniciado - Sistema de alarmas activo');
};

$('tabNuevo').onclick = () => cambiarPestaña('nuevo');
$('tabMedicamentos').onclick = () => cambiarPestaña('medicamentos');

nombre.oninput = function () { this.value = upper(this.value); };
paciente.oninput = function () { this.value = upper(this.value); };

$('menos').onclick = () => {
    cant.value = Math.max(0.25, parseFloat(cant.value) - 0.25).toFixed(2);
};

$('mas').onclick = () => {
    cant.value = (parseFloat(cant.value) + 0.25).toFixed(2);
};

$('newMenos').onclick = () => {
    $('newCant').value = Math.max(0.25, parseFloat($('newCant').value) - 0.25).toFixed(2);
};

$('newMas').onclick = () => {
    $('newCant').value = (parseFloat($('newCant').value) + 0.25).toFixed(2);
};

photoZone.onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';

    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = ev => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = 600 / img.width;
                canvas.width = 600;
                canvas.height = img.height * scale;
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

                foto = canvas.toDataURL('image/jpeg', 0.6);
                photoPreview.src = foto;
                photoPreview.classList.add('active');
                photoZone.style.display = 'none';
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    };
    input.click();
};

$('settingsToggle').onclick = () => {
    const panel = $('settingsPanel');
    const arrow = $('settingsArrow');
    panel.classList.toggle('open');
    arrow.classList.toggle('open');
};

volSlider.oninput = function () {
    volValue.textContent = Math.round(this.value * 100) + '%';
    saveConfig();
};

sonidoOn.onchange = saveConfig;
vozOn.onchange = saveConfig;
$('bgModeOn').onchange = () => {
    saveConfig();
    if ($('bgModeOn').checked) {
        startSilentAudio();
        showToast('🚀 Modo Segundo Plano', 'Protección activada. No cierres la pestaña.', 'success');
    } else {
        stopSilentAudio();
        showToast('⚠️ Modo Normal', 'La app podría dormirse si bloqueas el celular.', 'warning');
    }
};

$('addBtn').onclick = () => {
    const n = upper(nombre.value);
    const p = upper(paciente.value);

    if (!n || !cant.value || !hora.value || !p) {
        alert('Completa todos los campos');
        return;
    }

    const id = Date.now().toString();
    meds[id] = {
        nombre: n,
        paciente: p,
        foto: foto,
        horas: [{ h: hora.value, cant: parseFloat(cant.value) }]
    };

    save();

    nombre.value = '';
    paciente.value = '';
    cant.value = '1';
    hora.value = '';
    foto = '';
    photoPreview.classList.remove('active');
    photoZone.style.display = 'block';

    showToast('✅ Medicamento agregado', `${upper(n)} agregado para ${upper(p)}`, 'success');
    setTimeout(() => {
        cambiarPestaña('medicamentos');
        render();
    }, 800);
};

$('detailClose').onclick = () => detailModal.classList.remove('open');

$('calBtn').onclick = () => {
    const tomas = JSON.parse(localStorage.getItem('tomasMC') || '[]');
    const body = $('calBody');

    if (!tomas.length) {
        body.innerHTML = `
                    <div class="empty">
                        <div class="empty-icon">📅</div>
                        <p class="empty-text">Sin registros aún</p>
                    </div>
                `;
    } else {
        tomas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        body.innerHTML = tomas.map(t => {
            const fecha = new Date(t.fecha).toLocaleDateString('es-ES', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            });
            return `
                        <div class="cal-item">
                            <div class="cal-item-header">
                                <span class="cal-item-name">${upper(t.pastilla)}</span>
                                <span class="cal-item-date">${fecha}</span>
                            </div>
                            <div class="cal-item-detail">${upper(t.paciente)} · ${t.cantidad}u a las ${t.hora}</div>
                        </div>
                    `;
        }).join('');
    }

    calModal.classList.add('open');
};

$('calClose').onclick = () => calModal.classList.remove('open');

$('alertClose').onclick = () => {
    alertModal.classList.remove('open');
    stopAlarm();
};

$('alertTake').onclick = () => {
    medsActuales.forEach(med => {
        const hist = JSON.parse(localStorage.getItem('tomasMC') || '[]');
        hist.push({
            fecha: new Date().toISOString(),
            paciente: med.paciente,
            pastilla: med.nombre,
            cantidad: med.cantidad,
            hora: horaActual
        });
        localStorage.setItem('tomasMC', JSON.stringify(hist));
    });

    alertModal.classList.remove('open');
    stopAlarm();

    showToast('✓ Registrado en historial', 'La toma ha sido registrada correctamente', 'success');
};

$('testBtn').onclick = () => {
    const keys = Object.keys(meds);
    if (!keys.length) {
        alert('Agrega un medicamento primero');
        return;
    }

    const testMedicamentos = [];
    const usuarios = ['ISRAEL', 'MARIA', 'JUAN'];

    for (let i = 0; i < Math.min(keys.length, 3); i++) {
        const m = meds[keys[i]];
        if (m.horas.length) {
            const usuario = usuarios[i] || m.paciente;
            testMedicamentos.push({
                paciente: usuario,
                nombre: m.nombre,
                cantidad: m.horas[0].cant,
                foto: m.foto
            });
        }
    }

    if (testMedicamentos.length === 0) {
        alert('Los medicamentos necesitan horarios configurados');
        return;
    }

    medsActuales = testMedicamentos;
    const now = new Date();
    horaActual = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    console.log('🧪 Probando alarma con:', testMedicamentos);
    showAlert();
};

$('testSound').onclick = () => {
    if (!sonidoOn.checked) {
        alert('Activa el sonido primero');
        return;
    }

    console.log('🔊 Probando sonido...');

    const audio = $('audio');
    if (audio) {
        audio.src = 'https://assets.mixkit.co/sfx/preview/mixkit-alarm-digital-clock-beep-989.mp3';
        audio.volume = parseFloat(volSlider.value);
        audio.loop = false;

        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log('✅ Sonido de prueba iniciado');
            }).catch(error => {
                console.log('⚠️ Necesita interacción del usuario');
                const unlock = () => {
                    audio.play();
                    document.removeEventListener('click', unlock);
                };
                document.addEventListener('click', unlock, { once: true });
            });
        }
    }
};

$('testVoice').onclick = () => {
    if (!vozOn.checked) {
        alert('Activa la voz primero');
        return;
    }

    const u = new SpeechSynthesisUtterance(
        'Prueba de voz. Sistema MediClock Neo activado.'
    );
    u.lang = 'es-ES';
    u.volume = parseFloat(volSlider.value);
    speechSynthesis.speak(u);
};

$('cancelAddTime').onclick = () => {
    addTimeModal.classList.remove('open');
    currentMedForAddTime = null;
};

$('saveAddTime').onclick = () => {
    const horaValue = $('newHora').value;
    const cantidad = $('newCant').value;

    if (!horaValue) {
        showToast('⏰ Hora requerida', 'Selecciona una hora', 'warning');
        return;
    }

    if (!cantidad || parseFloat(cantidad) <= 0) {
        showToast('⚠️ Cantidad inválida', 'Ingresa una cantidad válida', 'warning');
        return;
    }

    if (currentMedForAddTime) {
        const m = meds[currentMedForAddTime];
        if (m.horas.some(x => x.h === horaValue)) {
            showToast('⚠️ Hora duplicada', 'Esta hora ya existe', 'warning');
            return;
        }

        m.horas.push({ h: horaValue, cant: parseFloat(cantidad) });
        m.horas.sort((a, b) => a.h.localeCompare(b.h));

        save();
        render();
        addTimeModal.classList.remove('open');
        currentMedForAddTime = null;

        showToast('✅ Hora agregada', `${horaValue} · ${cantidad}u`, 'success');
    }
};

$('editMenos').onclick = () => {
    $('editCant').value = Math.max(0.25, parseFloat($('editCant').value) - 0.25).toFixed(2);
};

$('editMas').onclick = () => {
    $('editCant').value = (parseFloat($('editCant').value) + 0.25).toFixed(2);
};

$('saveEditTime').onclick = () => {
    if (!editingTimeData) return;

    const newHora = $('editHora').value;
    const newCant = $('editCant').value;
    const m = meds[editingTimeData.medId];

    if (!newHora || !newCant) {
        showToast('⚠️ Campos requeridos', 'Completa hora y cantidad', 'warning');
        return;
    }

    const idx = m.horas.findIndex(x => x.h === editingTimeData.oldHora);
    if (idx === -1) return;

    if (newHora !== editingTimeData.oldHora && m.horas.some(x => x.h === newHora)) {
        showToast('⚠️ Hora duplicada', 'Esta hora ya existe', 'warning');
        return;
    }

    m.horas[idx].h = newHora;
    m.horas[idx].cant = parseFloat(newCant);
    m.horas.sort((a, b) => a.h.localeCompare(b.h));

    save();
    render();
    editTimeModal.classList.remove('open');
    editingTimeData = null;

    showToast('✅ Horario actualizado', `${editingTimeData.oldHora} → ${newHora}`, 'success');
};

$('deleteTime').onclick = () => {
    if (!editingTimeData) return;

    if (confirm(`¿Eliminar el horario ${editingTimeData.oldHora}?`)) {
        const m = meds[editingTimeData.medId];
        const idx = m.horas.findIndex(x => x.h === editingTimeData.oldHora);

        if (idx !== -1) {
            m.horas.splice(idx, 1);
            save();
            render();
            editTimeModal.classList.remove('open');
            editingTimeData = null;

            showToast('✅ Horario eliminado', `Hora ${editingTimeData.oldHora} eliminada`, 'success');
        }
    }
};

$('cancelEditTime').onclick = () => {
    editTimeModal.classList.remove('open');
    editingTimeData = null;
};

[alertModal, detailModal, editTimeModal, calModal, addTimeModal].forEach(modal => {
    modal.onclick = e => {
        if (e.target === modal) {
            modal.classList.remove('open');
            if (modal === alertModal) stopAlarm();
            if (modal === editTimeModal) editingTimeData = null;
            if (modal === addTimeModal) currentMedForAddTime = null;
        }
    };
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        console.log('✉️ Mensaje del SW:', event.data.type);
        if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
            if (event.data.action === 'take') {
                medsActuales.forEach(med => {
                    const hist = JSON.parse(localStorage.getItem('tomasMC') || '[]');
                    hist.push({
                        fecha: new Date().toISOString(),
                        paciente: med.paciente,
                        pastilla: med.nombre,
                        cantidad: med.cantidad,
                        hora: horaActual
                    });
                    localStorage.setItem('tomasMC', JSON.stringify(hist));
                });
                stopAlarm();
                showToast('✓ Toma registrada', 'Desde notificación', 'success');
            }
        } else if (event.data && event.data.type === 'CHECK_ALARMS') {
            checkAlarms();
        }
    });
}

if ('wakeLock' in navigator) {
    try {
        navigator.wakeLock.request('screen').then(wakeLock => {
            console.log('🔋 Wake Lock activado');
        }).catch(err => {
            console.log('Wake Lock no disponible:', err);
        });
    } catch (err) {
        console.log('Wake Lock no soportado:', err);
    }
}

window.onbeforeunload = () => {
    if (checkInterval) clearInterval(checkInterval);
    stopAlarm();
};
