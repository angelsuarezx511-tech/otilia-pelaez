// ── Seguridad de login ─────────────────────────────────────────────
var _loginAttempts = {};
var _MAX_ATTEMPTS  = 5;
var _LOCKOUT_MS    = 10 * 60 * 1000;
function checkLoginSecurity(e){
  if(!_loginAttempts[e]) _loginAttempts[e]={count:0,lockedUntil:0};
  var r=_loginAttempts[e];
  if(r.lockedUntil>Date.now()){
    var m=Math.ceil((r.lockedUntil-Date.now())/60000);
    return {blocked:true,msg:'🔒 Bloqueado '+m+' min. Demasiados intentos.'};
  }
  return {blocked:false};
}
function recordFailedLogin(e){
  if(!_loginAttempts[e]) _loginAttempts[e]={count:0,lockedUntil:0};
  _loginAttempts[e].count++;
  if(_loginAttempts[e].count>=_MAX_ATTEMPTS){
    _loginAttempts[e].lockedUntil=Date.now()+_LOCKOUT_MS;
    _loginAttempts[e].count=0;
  }
}
function clearLoginAttempts(e){ if(_loginAttempts[e]) _loginAttempts[e]={count:0,lockedUntil:0}; }
function doLogout(){ if(typeof logout==='function') logout(); }
var _lastActivity=Date.now();
setInterval(function(){if(typeof APP!=='undefined'&&APP.currentUser&&Date.now()-_lastActivity>7200000){doLogout();}},60000);
document.addEventListener('click',   function(){_lastActivity=Date.now();});
document.addEventListener('keypress',function(){_lastActivity=Date.now();});

// ================================================
//   Centro Educativo Otilia Pelaez — script.js
// ================================================

const APP={
  currentUser:null,
  announcements:[],students:[],notas:[],ausencias:[],
  inscripciones:[],reportes:[],padres:[],mensajes:[],
  notifications:[],customSections:[],profesores:[],
  districtConnected:false,districtEmail:'',
  accounts:{
    admin:{email:'otiliapelaezadm@gmail.com',password:'otiliapelaezadmin1',role:'admin',name:'Administración'},
    profesor:{email:'profeoti12@gmail.com',password:'PROFESOTILIA@121',role:'profesor',name:'Profesor(a)'},
    enfermeria:{email:'enfermeriaoti@gmail.com',password:'ENFEROTI@2025',role:'enfermeria',name:'Enfermería'}
  }
};

// ================================================
//   PERSISTENCIA — Firebase Firestore + localStorage backup
// ================================================

// ── CONFIGURACIÓN FIREBASE ──────────────────────
// INSTRUCCIONES: Reemplaza estos valores con los de tu proyecto Firebase
// Ve a: console.firebase.google.com → Tu proyecto → Configuración → SDK
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBFJtMciX8UpsxsXEoyeyQIrEDGuPDMOAQ",
  authDomain:        "otilia-pelaez.firebaseapp.com",
  projectId:         "otilia-pelaez",
  storageBucket:     "otilia-pelaez.firebasestorage.app",
  messagingSenderId: "113441115421",
  appId:             "1:113441115421:web:503584c9b5810d7dc8a5f4"
};
// ────────────────────────────────────────────────

const STORE_KEY = 'otiliaAPP_v2';
const FIRESTORE_DOC = 'configuracion/principal';

// Keys we persist
const PERSIST_KEYS = [
  // Contenido académico
  'announcements','students','notas','ausencias','inscripciones',
  'reportes','padres','mensajes','profesores','galeria','tareas',
  'horarios','_horarioEdit','destacados','honorConfig','auditLog',
  // Bot y configuración
  'botConfig','botPadreConfig','botProfeConfig','botAdminConfig',
  '_botStats','loginDesign','registroDesign','reglamento','categoriasConfig',
  // Secciones y diseño
  'customSections','districtConnected','districtEmail','cfgHero',
  'cfgNiveles','cfgInstalaciones','cfgCalendario','cfgTestimonios',
  'cfgMaestros','cfgFooter','cfgInfo','config','accounts',
  // Módulos extra
  'pagos','eventos','_notifHistory','_userNotifs','productos',
  'consultas','stockEnfer','carreras','profilePhotos',
  'blog','egresados','maestrosPublicos',
  'sesiones','customSections',
  'reportesAsistencia','egresados'
];

// Firebase instance (initialized on first save/load)
var _db = null;
var _firebaseReady = false;
var _usingFirebase = false;

function initFirebase(){
  return new Promise(function(resolve){
    // Check if Firebase SDK loaded
    if(typeof firebase === 'undefined'){
      console.warn('Firebase SDK no cargado — usando localStorage');
      resolve(false); return;
    }
    // Check if configured (not placeholder values)
    if(FIREBASE_CONFIG.apiKey === 'TU_API_KEY_AQUI'){
      console.warn('Firebase no configurado — usando localStorage. Edita FIREBASE_CONFIG en script.js');
      resolve(false); return;
    }
    try{
      if(!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      _db = firebase.firestore();
      _firebaseReady = true;
      _usingFirebase = true;
      console.log('✅ Firebase conectado');
      // ── Listener en tiempo real — sincroniza cambios de otros dispositivos ──
      var chunks = ['config','datos','misc','media'];
      chunks.forEach(function(chunkKey){
        _db.collection('otilia').doc(chunkKey).onSnapshot(function(doc){
          if(!doc.exists) return;
          var d = doc.data();
          PERSIST_KEYS.forEach(function(k){
            if(d[k] !== undefined){
              // No sobreescribir si hay usuario activo haciendo cambios (evitar race condition)
              APP[k] = d[k];
            }
          });
          // Siempre garantizar cuentas críticas
          if(!APP.accounts) APP.accounts = {};
          APP.accounts.enfermeria = {email:'enfermeriaoti@gmail.com',password:'ENFEROTI@2025',role:'enfermeria',name:'Enfermería'};
          // Refrescar UI si hay usuario logueado
          if(APP.currentUser){
            if(typeof updateCounters==='function') updateCounters();
            if(typeof renderCustomSections==='function') renderCustomSections();
          }
        }, function(err){ console.warn('Listener error:', err); });
      });
      resolve(true);
    }catch(e){
      console.warn('Error Firebase:', e);
      resolve(false);
    }
  });
}

// ── SAVE ──────────────────────────────────────────
// Auto-save interval — every 10 seconds if logged in (más frecuente que los 30s anteriores)
setInterval(function(){
  if(APP.currentUser) persistSave();
}, 10000);

function persistSave(){
  var data={};
  PERSIST_KEYS.forEach(function(k){ if(APP[k]!==undefined) data[k]=APP[k]; });

  // 1. Siempre guardar en localStorage (instantáneo, funciona offline)
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  }catch(e){ console.warn('localStorage save error:',e); }

  // 2. Guardar en Firebase (global, todos los dispositivos)
  if(_firebaseReady && _db){
    var chunks = splitIntoChunks(data);
    Object.keys(chunks).forEach(function(chunkKey){
      _db.collection('otilia').doc(chunkKey).set(chunks[chunkKey])
        .then(function(){ _pendingSave = false; })
        .catch(function(e){ console.warn('Firebase save error ('+chunkKey+'):', e); _pendingSave = true; });
    });
  } else {
    // Sin Firebase — marcar como pendiente para reintentar
    _pendingSave = true;
  }
}

function splitIntoChunks(data){
  var chunk1 = {}, chunk2 = {}, chunk3 = {}, chunk4 = {};
  // Chunk1: config/settings (small)
  var configs = ['botConfig','botPadreConfig','botProfeConfig','botAdminConfig','loginDesign',
    'registroDesign','reglamento','categoriasConfig','cfgHero','cfgFooter','cfgInfo',
    'config','accounts','honorConfig','horarios','carreras','maestrosPublicos',
    'pagos','productos','stockEnfer','eventos','customSections'];
  // Chunk2: big student/academic data
  var bigData = ['students','padres','notas','ausencias','inscripciones','galeria',
    'auditLog','mensajes','profesores','tareas'];
  // Chunk3: notifications & misc
  var notifs = ['_notifHistory','_userNotifs','_botStats','blog','egresados',
    'consultas','announcements','destacados','sesiones','reportesAsistencia'];
  // Chunk4: media/photos
  var media = ['profilePhotos'];

  Object.keys(data).forEach(function(k){
    if(configs.indexOf(k)  > -1) chunk1[k] = data[k];
    else if(bigData.indexOf(k) > -1) chunk2[k] = data[k];
    else if(notifs.indexOf(k)  > -1) chunk3[k] = data[k];
    else if(media.indexOf(k)   > -1) chunk4[k] = data[k];
    else chunk3[k] = data[k]; // fallback
  });
  return { 'config': chunk1, 'datos': chunk2, 'misc': chunk3, 'media': chunk4 };
}

// ── LOAD ──────────────────────────────────────────
function persistLoad(){
  // Always load from localStorage first (fast, works offline)
  try{
    var raw = localStorage.getItem(STORE_KEY);
    if(raw){
      var data = JSON.parse(raw);
      PERSIST_KEYS.forEach(function(k){
        if(data[k] !== undefined) APP[k] = data[k];
      });
      // Siempre garantizar cuenta de enfermería (no debe sobreescribirse)
      if(!APP.accounts) APP.accounts = {};
      APP.accounts.enfermeria = {email:'enfermeriaoti@gmail.com',password:'ENFEROTI@2025',role:'enfermeria',name:'Enfermería'};
      console.log('✅ Estado restaurado desde localStorage');
    }
  }catch(e){ console.warn('localStorage load error:',e); }

  // Then sync from Firebase (newer data from other devices)
  if(_firebaseReady && _db){
    var merged = {};
    var chunks = ['config','datos','misc','media'];
    var loaded = 0;
    chunks.forEach(function(chunkKey){
      _db.collection('otilia').doc(chunkKey).get()
        .then(function(doc){
          if(doc.exists){
            var d = doc.data();
            Object.assign(merged, d);
          }
          loaded++;
          if(loaded === chunks.length && Object.keys(merged).length > 0){
            PERSIST_KEYS.forEach(function(k){
              if(merged[k] !== undefined) APP[k] = merged[k];
            });
            // Siempre garantizar cuenta de enfermería tras sync
            if(!APP.accounts) APP.accounts = {};
            APP.accounts.enfermeria = {email:'enfermeriaoti@gmail.com',password:'ENFEROTI@2025',role:'enfermeria',name:'Enfermería'};
            console.log('✅ Datos sincronizados desde Firebase');
            // Restaurar foto después de sync Firebase
            setTimeout(function(){ if(APP.currentUser) restoreProfilePhotos(); }, 200);
            // Also update localStorage with fresh Firebase data
            try{ localStorage.setItem(STORE_KEY, JSON.stringify(merged)); }catch(e){}
            // Re-apply UI if user is already logged in
            if(APP.currentUser) setTimeout(applyAllSavedConfig, 100);
          }
        })
        .catch(function(e){ console.warn('Firebase load error ('+chunkKey+'):', e); });
    });
  }
}

// ── CLEAR ──────────────────────────────────────────
function persistClear(){
  // Clear localStorage
  localStorage.removeItem(STORE_KEY);
  // Clear Firebase
  if(_firebaseReady && _db){
    ['config','datos','misc'].forEach(function(chunkKey){
      _db.collection('otilia').doc(chunkKey).delete()
        .catch(function(e){ console.warn('Firebase clear error:', e); });
    });
    toast('🗑 Base de datos limpiada en Firebase y localStorage','info');
  } else {
    toast('💾 Datos locales eliminados. Recarga para empezar de cero.','info');
  }
}

// ── DB STATUS INDICATOR ───────────────────────────
function showDbStatus(){
  var statusBar = document.getElementById('db-status-bar');
  if(!statusBar) return;
  if(_usingFirebase){
    statusBar.innerHTML = '<span style="color:#22c55e;font-weight:700;">🔥 Firebase conectado</span> <span style="color:#888;font-size:11px;">· Los datos se sincronizan en la nube</span>';
  } else {
    statusBar.innerHTML = '<span style="color:#f59e0b;font-weight:700;">💾 Modo local</span> <span style="color:#888;font-size:11px;">· Configura Firebase para sincronización en la nube</span>';
  }
}

// ── INIT ──────────────────────────────────────────
// Try to connect Firebase, then load data
initFirebase().then(function(connected){
  persistLoad();
  setTimeout(showDbStatus, 500);
});

// Auto-save every 30 seconds
// Auto-save cada 10 seg para cualquier usuario logueado
setInterval(function(){
  if(APP.currentUser) persistSave();
}, 10000);

const FB_POSTS=[
  {id:1,text:'¡Bienvenidos al nuevo año escolar 2025-2026! Estamos listos para brindarles la mejor educación. 🎒📚',date:'Hace 2 días',likes:'48',emoji:'🏫'},
  {id:2,text:'📢 Reunión de padres y maestros el próximo viernes a las 5:00 PM en el salón de actos.',date:'Hace 5 días',likes:'32',emoji:'📢'},
  {id:3,text:'🎉 Felicitamos a nuestros estudiantes destacados del trimestre. ¡Su dedicación es un ejemplo!',date:'Hace 1 semana',likes:'87',emoji:'🏆'},
  {id:4,text:'🌟 Hoy celebramos el Día del Maestro. ¡Gracias a todos nuestros docentes!',date:'Hace 2 semanas',likes:'124',emoji:'👩‍🏫'},
  {id:5,text:'📝 Inscripciones abiertas 2025-2026. Informes: (809) 590-0771.',date:'Hace 3 semanas',likes:'56',emoji:'📝'},
  {id:6,text:'🏀 ¡Campeones del torneo interescolar del Distrito 10-02! ¡Felicitaciones!',date:'Hace 1 mes',likes:'203',emoji:'🏀'},
];

function renderFbPosts(){
  const g=document.getElementById('fb-posts-grid');
  if(!g)return;
  g.innerHTML=FB_POSTS.map(p=>`
    <div class="fb-post-card">
      <div class="fb-post-header">
        <div class="fb-avatar"><img src="imagenes/logo_otilia_pelaez.png" alt="Logo" onerror="this.parentElement.innerHTML='OP'"></div>
        <div class="fb-post-info"><h4>C.E. Otilia Peláez</h4><span>${p.date}</span></div>
      </div>
      <div class="fb-post-emoji">${p.emoji}</div>
      <div class="fb-post-body"><p>${p.text}</p></div>
      <div class="fb-post-footer"><span>👍 ${p.likes}</span><span>💬 Comentar</span></div>
    </div>`).join('');
}

// ===== LOGIN / REGISTRO =====
function showRegister(){
  document.getElementById('login-form-wrap').style.display='none';
  document.getElementById('register-form-wrap').style.display='block';
  checkRegTipo();
}
function showLogin(){
  document.getElementById('register-form-wrap').style.display='none';
  document.getElementById('login-form-wrap').style.display='block';
  document.getElementById('login-alert').style.display='none';
}
function checkRegTipo(){
  const tipo=(document.getElementById('reg-tipo') && document.getElementById('reg-tipo').value);
  if(tipo==='estudiante'){
    document.getElementById('reg-padre-section').style.display='none';
    document.getElementById('reg-alumno-section').style.display='block';
    checkSecundaria();
    // Re-check padre link in case padre was registered in same session
    var emailPadreEl=document.getElementById('reg-email-padre');
    if(emailPadreEl && emailPadreEl.value) checkPadreEmailLink();
  } else {
    document.getElementById('reg-padre-section').style.display='block';
    document.getElementById('reg-alumno-section').style.display='none';
  }
}
function checkSecundaria(){ checkRegGrado(); }

function doRegister(){
  const tipo=document.getElementById('reg-tipo').value;
  const nombre=document.getElementById('reg-nombre').value.trim();
  const apellido=document.getElementById('reg-apellido').value.trim();
  const email=document.getElementById('reg-email').value.trim().toLowerCase();
  const pass=document.getElementById('reg-pass').value;
  const alertEl=document.getElementById('reg-alert');

  if(!nombre||!apellido||!email||!pass){alertEl.textContent='Complete todos los campos.';alertEl.style.display='block';return;}
  const allAccounts=[...APP.padres,...APP.students];
  if(allAccounts.find(a=>a.email===email)||email===APP.accounts.admin.email){alertEl.textContent='Este correo ya está registrado.';alertEl.style.display='block';return;}

  if(tipo==='padre'||tipo==='tutor'){
    const hijo=document.getElementById('reg-hijo').value.trim();
    const telPadre=document.getElementById('reg-tel-padre').value.trim();
    if(!hijo){alertEl.textContent='Ingrese el nombre de su hijo/a.';alertEl.style.display='block';return;}
    APP.padres.push({nombre,apellido,email,pass,hijo,telefono:telPadre,tipo});
    persistSave();
  } else {
    // Estudiante
    const grado=document.getElementById('reg-grado').value;
    if(!grado){alertEl.textContent='Seleccione el grado.';alertEl.style.display='block';return;}
    const esBachillerato=['4° Secundaria','5° Secundaria','6° Secundaria'].includes(grado);
    const carreraEl=document.getElementById('reg-carrera');
    const carrera=esBachillerato&&carreraEl?carreraEl.value.trim():'';
    const telPadre=document.getElementById('reg-tel-padre-alum').value.trim();
    const emailPadre=document.getElementById('reg-email-padre').value.trim().toLowerCase();
    const passConfirmEl=document.getElementById('reg-pass-confirm');
    const passConfirm=passConfirmEl?passConfirmEl.value:'';
    if(passConfirm&&pass!==passConfirm){alertEl.textContent='Las contraseñas no coinciden.';alertEl.style.display='block';return;}
    const id='STU-'+Date.now();
    APP.students.push({id,nombre,apellido,email,pass,grado,esBachillerato,carrera,telPadre,emailPadre,tipo:'estudiante'});
  persistSave();
  }
  toast('¡Cuenta creada! Ya puedes iniciar sesión.','success');
  showLogin();
  document.getElementById('login-email').value=email;
}

function doLogin(){
  const email=document.getElementById('login-email').value.trim().toLowerCase();
  const pass=document.getElementById('login-password').value;
  const alertEl=document.getElementById('login-alert');
  if(!email||!pass){alertEl.textContent='Ingrese correo y contraseña.';alertEl.style.display='block';return;}
  // Seguridad: bloquear tras múltiples intentos
  var sec = checkLoginSecurity(email);
  if(sec.blocked){alertEl.textContent=sec.msg;alertEl.style.display='block';return;}
  if(email===APP.accounts.admin.email&&pass===APP.accounts.admin.password)
    return loginAs({role:'admin',name:'Administración',email});
  // Profesor cuenta fija — correo insensible a mayúsculas
  if(email===APP.accounts.profesor.email.toLowerCase()&&pass===APP.accounts.profesor.password)
    return loginAs({role:'profesor',name:'Profesor(a)',email});
  const st=APP.students.find(s=>s.email&&s.email.toLowerCase()===email&&s.pass===pass);
  if(st)return loginAs({role:'estudiante',name:st.nombre+' '+st.apellido,email,studentId:st.id});
  const padre=APP.padres.find(p=>p.email.toLowerCase()===email&&p.pass===pass);
  if(padre)return loginAs({role:'padre',name:padre.nombre+' '+padre.apellido,email,child:padre.hijo,padreData:padre});
  // Check profesor accounts
  const prof=APP.profesores?APP.profesores.find(p=>p.email.toLowerCase()===email&&p.pass===pass):null;
  if(prof)return loginAs({role:'profesor',name:prof.nombre+' '+prof.apellido,email,profId:prof.id});
  // Admins extra asignados desde el panel
  var extraAdmins = APP.accounts.admins || [];
  for(var ai=0; ai<extraAdmins.length; ai++){
    var ea = extraAdmins[ai];
    if(ea && email===ea.email.toLowerCase() && pass===ea.password)
      return loginAs({role:'admin', name:ea.name||'Administrador', email:ea.email});
  }
  // Enfermería
  var enf=APP.accounts.enfermeria;
  if(enf && email===enf.email.toLowerCase() && pass===enf.password)
    return loginAs({role:'enfermeria',name:enf.name,email});
  recordFailedLogin(email);
  var att = (_loginAttempts[email]||{}).count||0;
  var remaining = _MAX_ATTEMPTS - att;
  alertEl.textContent='Correo o contraseña incorrectos.'+(remaining>0?' ('+remaining+' intentos restantes)':'');
  alertEl.style.display='block';
}

function loginAs(user){
  persistLoad(); // Restore any saved state
  APP.currentUser=user;
  document.getElementById('login-screen').style.display='none';
  document.getElementById('navbar').style.display='flex';
  // Hide public navbar and top bar when logged in
  var pubNav=document.getElementById('public-navbar');if(pubNav)pubNav.style.display='none';
  var topBar=document.getElementById('top-bar-public');if(topBar)topBar.style.display='none';
  document.getElementById('nav-username').textContent=user.name;
  const roles={admin:'ADMIN',profesor:'PROF',estudiante:'EST',padre:'PADRE',enfermeria:'ENFER'};
  document.getElementById('nav-role').textContent=roles[user.role]||user.role.toUpperCase();
  buildNavbar(user.role);
  buildCatBar(user.role);
  showPage('home');
  if(user.role==='admin'){renderAdminData();fillAdminPerfil(user);}
  else if(user.role==='profesor'){renderProfesorData();fillProfPerfil(user);}
  else if(user.role==='estudiante') renderEstudianteData(user.studentId);
  else if(user.role==='padre'){renderPadreData(user);fillPadrePerfil(user);}
  else if(user.role==='enfermeria'){
    showPage('enfermeria');
    // Si no tiene nombre personalizado, pedir nombre completo
    var nombreGuardado = APP.config && APP.config.enferNombre;
    if(!nombreGuardado){
      setTimeout(function(){
        var n = prompt('👋 Bienvenida/o. Por favor ingrese su nombre completo:','');
        if(n && n.trim()){
          if(!APP.config) APP.config = {};
          APP.config.enferNombre = n.trim();
          persistSave();
          document.getElementById('enfer-nombre-display').textContent = n.trim();
          document.getElementById('enfer-perfil-nombre').textContent  = n.trim();
          document.getElementById('nav-username').textContent = n.trim();
          APP.currentUser.name = n.trim();
          toast('¡Bienvenida/o, '+n.trim()+'!','success');
        }
      }, 400);
    } else {
      document.getElementById('enfer-nombre-display').textContent = nombreGuardado;
      document.getElementById('enfer-perfil-nombre').textContent  = nombreGuardado;
      document.getElementById('nav-username').textContent = nombreGuardado;
      APP.currentUser.name = nombreGuardado;
    }
    document.getElementById('enfer-perfil-email').textContent = user.email;
    populateConsultaEstSelect();
    renderEnferInicio();
  }
  showPortalFab(user.role);
  // Remember me
  // Guardar sesión SIEMPRE (no solo con remember-me)
  saveSession(user);
  var rememberMe=document.getElementById('remember-me');
  // remember-me ya no es necesario pero se mantiene para compatibilidad
  // Seguridad: limpiar intentos fallidos
  clearLoginAttempts(user.email||'');
  resetActivityTimer();
  // Session log
  if(!APP.sesiones)APP.sesiones=[];
  APP.sesiones.unshift({usuario:user.name,email:user.email,rol:user.role,fecha:new Date().toLocaleDateString('es-DO'),hora:new Date().toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'})});
  // Audit
  logAudit('login','Inicio de sesión: '+user.name+' ('+user.role+')',user.name);
  // Chat widget — only for estudiante and padre
  chatHistory=[];chatOpen=false;
  // Show correct bot FAB per role
  var bc=APP.botConfig;
  showAllBotFabs(false);
  if(user.role==='estudiante'){
    var showWidget=(!bc||bc.accEst!==false);
    showChatWidget(showWidget);
    if(showWidget&&bc&&bc.autoOpen){setTimeout(function(){if(!chatOpen)toggleChat();},1200);}
  } else if(user.role==='padre'){
    showChatWidget(false);
    showBotFab('padre',true);
  } else if(user.role==='profesor'){
    showChatWidget(false);
    showBotFab('profe',true);
  } else if(user.role==='admin'){
    showChatWidget(false);
    showBotFab('admin',true);
  }
  // Reapply all saved configurations to the UI
  setTimeout(applyAllSavedConfig, 200);
  setTimeout(function(){
    restoreProfilePhotos();
    // Also fill all profile forms fresh
    if(APP.currentUser){
      if(APP.currentUser.role==='padre') fillPadrePerfil(APP.currentUser);
    }
  }, 400);
  setTimeout(updateNotifBadge, 350);
  // Categorías tab: SOLO visible para el admin
  setTimeout(function(){
    var catTabBtn = document.querySelector('.cfg-tab[onclick*="cfg-categorias"]');
    if(catTabBtn) catTabBtn.style.display = (user.role==='admin') ? '' : 'none';
    // Also hide the entire Config section tab from nav for non-admins (already hidden, but double lock)
  }, 250);
  // Destacados banner
  if(user.role==='estudiante'){setTimeout(function(){renderDestacadosBanner();},300);}
  // Cargar notificaciones pendientes
  if(APP._userNotifs&&APP._userNotifs[user.email]){
    APP._userNotifs[user.email].forEach(function(n){if(!n.leido){addNotification(n.msg);n.leido=true;}});
  }
  toast('¡Bienvenido/a, '+user.name+'!','success');
}

function buildCatBar(role){
  // Segunda barra eliminada — todo va en el navbar principal
}

function showPortalFab(role){
  var fab=document.getElementById('portal-fab');
  var icon=document.getElementById('portal-fab-icon');
  var label=document.getElementById('portal-fab-label');
  if(!fab)return;
  var labels={admin:'Panel Admin',profesor:'Mi Panel',estudiante:'Mi Portal',padre:'Mi Portal',enfermeria:'Enfermería'};
  var icons={admin:'⚙️',profesor:'👨‍🏫',estudiante:'🎓',padre:'👪',enfermeria:'🏥'};
  if(icon) icon.textContent=icons[role]||'🏠';
  if(label) label.textContent=labels[role]||'Mi Portal';
  fab.style.display='block';
}

function goToPortal(){
  if(!APP.currentUser)return;
  var role=APP.currentUser.role;
  if(role==='admin') showPage('admin');
  else if(role==='profesor'){showPage('profesor');fillProfPerfil(APP.currentUser);}
  else if(role==='estudiante') showPage('estudiante');
  else if(role==='padre') showPage('padre');
}

function buildNavbar(role){
  const nl=document.getElementById('nav-links-dynamic');
  if(!nl)return;
  let html='';
  if(role==='admin'){
    html=`
      <div class="nav-dropdown">
        <button class="nav-btn" onclick="showPage('home')">🏠 Inicio</button>
      </div>
      <div class="nav-dropdown">
        <button class="nav-btn dropdown-trigger">🏫 Centro ▾</button>
        <div class="dropdown-menu">
          <a onclick="showPage('about')">📚 Sobre Nosotros</a>
          <a onclick="showPage('anuncios')">📢 Anuncios</a>
          <a onclick="showPage('pagos-public')">💰 Tarifas y Pagos</a>
          <a onclick="showPage('reglamento-public')">📜 Reglamento</a>
          <a onclick="showAdminSection('dash-config')">⚙️ Configuración</a>
          <a onclick="showAdminSection('dash-custom')">➕ Secciones Web</a>
        </div>
      </div>
      <div class="nav-dropdown">
        <button class="nav-btn dropdown-trigger">👥 Gestión ▾</button>
        <div class="dropdown-menu">
          <a onclick="showAdminSection('dash-estudiantes')">🎓 Estudiantes</a>
          <a onclick="showAdminSection('dash-inscripciones')">📝 Inscripciones</a>
          <a onclick="showAdminSection('dash-ausencias')">📅 Ausencias</a>
          <a onclick="showAdminSection('dash-notas')">📋 Notas</a>
        </div>
      </div>
      <div class="nav-dropdown">
        <button class="nav-btn dropdown-trigger">📊 Reportes ▾</button>
        <div class="dropdown-menu">
          <a onclick="showAdminSection('dash-reportes')">📨 Reportes</a>
          <a onclick="showAdminSection('dash-mensajes')">💬 Mensajes</a>
          <a onclick="showAdminSection('dash-distrito')">🔗 Distrito</a>
        </div>
      </div>`;
  } else if(role==='profesor'){
    html=`
      <div class="nav-dropdown">
        <button class="nav-btn" onclick="showPage('home')">🏠 Inicio</button>
      </div>
      <div class="nav-dropdown">
        <button class="nav-btn dropdown-trigger">🏫 Centro ▾</button>
        <div class="dropdown-menu">
          <a onclick="showPage('pagos-public')">💰 Tarifas y Pagos</a>
          <a onclick="showPage('reglamento-public')">📜 Reglamento</a>
          <a onclick="showPage('anuncios')">📢 Anuncios</a>
          <a onclick="showPage('about')">📚 Sobre Nosotros</a>
        </div>
      </div>
      <div class="nav-dropdown">
        <button class="nav-btn dropdown-trigger">👨‍🏫 Maestros ▾</button>
        <div class="dropdown-menu">
          <a onclick="showPage('profesor');showProfeSection('profe-notas',null)">📋 Notas</a>
          <a onclick="showPage('profesor');showProfeSection('profe-records',null)">📂 Récords</a>
          <a onclick="showPage('profesor');showProfeSection('profe-ausencias',null)">📅 Ausencias</a>
          <a onclick="showPage('profesor');showProfeSection('profe-mensajes',null)">💬 Mensajes/Reuniones</a>
        </div>
      </div>
      <div class="nav-dropdown">
        <button class="nav-btn" onclick="showPage('anuncios')">📢 Anuncios</button>
      </div>`;
  } else if(role==='estudiante'){
    html=`
      <div class="nav-dropdown">
        <button class="nav-btn" onclick="showPage('home')">🏠 Inicio</button>
      </div>
      <div class="nav-dropdown">
        <button class="nav-btn dropdown-trigger">🏫 Centro ▾</button>
        <div class="dropdown-menu">
          <a onclick="showPage('pagos-public')">💰 Tarifas y Pagos</a>
          <a onclick="showPage('reglamento-public')">📜 Reglamento</a>
          <a onclick="showPage('anuncios')">📢 Anuncios</a>
          <a onclick="showPage('about')">📚 Sobre Nosotros</a>
        </div>
      </div>
      <div class="nav-dropdown">
        <button class="nav-btn" onclick="showPage('estudiante');showEstudianteSection('est-notas')">📋 Mis Notas</button>
      </div>
      <div class="nav-dropdown">
        <button class="nav-btn dropdown-trigger">👤 Mi Cuenta ▾</button>
        <div class="dropdown-menu">
          <a onclick="showPage('estudiante');showEstudianteSection('est-perfil')">📄 Perfil Académico</a>
          <a onclick="showPage('estudiante');showEstudianteSection('est-notas')">📋 Mis Notas</a>
          <a onclick="openModal('modal-reporte')">📨 Enviar Reporte</a>
        </div>
      </div>
      <div class="nav-dropdown">
        <button class="nav-btn" onclick="showPage('anuncios')">📢 Anuncios</button>
      </div>`;
  } else if(role==='enfermeria'){
    html=`
      <div class="nav-dropdown">
        <button class="nav-btn" onclick="showPage('home')">🏠 Inicio</button>
      </div>
      <div class="nav-dropdown">
        <button class="nav-btn dropdown-trigger">🏫 Centro ▾</button>
        <div class="dropdown-menu">
          <a onclick="showPage('pagos-public')">💰 Tarifas y Pagos</a>
          <a onclick="showPage('reglamento-public')">📜 Reglamento</a>
          <a onclick="showPage('anuncios')">📢 Anuncios</a>
          <a onclick="showPage('about')">📚 Sobre Nosotros</a>
        </div>
      </div>
      <div class="nav-dropdown">
        <button class="nav-btn dropdown-trigger">🏥 Enfermería ▾</button>
        <div class="dropdown-menu">
          <a onclick="showPage('enfermeria');showEnferSection('enfer-registros');renderRegistrosEnfer()">📋 Consultas</a>
          <a onclick="openModal('modal-consulta');populateConsultaEstSelect()">➕ Nueva Consulta</a>
          <a onclick="showPage('enfermeria');showEnferSection('enfer-buscar');renderBuscarEstEnfer()">🔍 Buscar Estudiante</a>
          <a onclick="showPage('enfermeria');showEnferSection('enfer-stock');renderStock()">💊 Stock</a>
          <a onclick="showPage('enfermeria');showEnferSection('enfer-estadisticas');renderEnferStats()">📊 Estadísticas</a>
        </div>
      </div>`;
  } else if(role==='padre'){
    html=`
      <div class="nav-dropdown">
        <button class="nav-btn" onclick="showPage('home')">🏠 Inicio</button>
      </div>
      <div class="nav-dropdown">
        <button class="nav-btn dropdown-trigger">🏫 Centro ▾</button>
        <div class="dropdown-menu">
          <a onclick="showPage('pagos-public')">💰 Tarifas y Pagos</a>
          <a onclick="showPage('reglamento-public')">📜 Reglamento</a>
          <a onclick="showPage('anuncios')">📢 Anuncios</a>
          <a onclick="showPage('about')">📚 Sobre Nosotros</a>
        </div>
      </div>
      <div class="nav-dropdown">
        <button class="nav-btn" onclick="showPage('padre');showPadreSection('padre-notas')">📋 Notas del Estudiante</button>
      </div>
      <div class="nav-dropdown">
        <button class="nav-btn" onclick="showPage('padre');showPadreSection('padre-inscripciones')">📝 Inscripciones</button>
      </div>
      <div class="nav-dropdown">
        <button class="nav-btn" onclick="showPage('padre');showPadreSection('padre-mensajes-section');renderMensajes()">💬 Mensaje al Profesor</button>
      </div>
      <div class="nav-dropdown">
        <button class="nav-btn" onclick="showPage('anuncios')">📢 Anuncios</button>
      </div>`;
  }
  nl.innerHTML=html;
  // Re-attach dropdown events
  document.querySelectorAll('.dropdown-trigger').forEach(btn=>{
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      const menu=this.nextElementSibling;
      document.querySelectorAll('.dropdown-menu.open').forEach(m=>{if(m!==menu)m.classList.remove('open');});
      menu.classList.toggle('open');
    });
  });
  document.addEventListener('click',()=>{
    document.querySelectorAll('.dropdown-menu.open').forEach(m=>m.classList.remove('open'));
  },{once:false});
}

function showAdminSection(id){
  showPage('admin');
  setTimeout(()=>{
    const btn=document.querySelector(`[data-section="${id}"]`);
    showDashSection(id,btn);
  },50);
}

function logout(){
  // Guardar todo antes de salir
  try{ persistSave(); }catch(e){}
  logAudit('login','Cierre de sesión: '+(APP.currentUser&&APP.currentUser.name||'—'),APP.currentUser&&APP.currentUser.name);
  showChatWidget(false);
  showAllBotFabs(false);
  // Close any open role bots
  ['padre','profesor','admin'].forEach(function(r){var m=document.getElementById('bot-modal-'+r);if(m)m.style.display='none';});
  APP.currentUser=null;
  document.getElementById('navbar').style.display='none';
  var fab=document.getElementById('portal-fab');if(fab)fab.style.display='none';
  var bar=document.getElementById('cat-bar');if(bar)bar.style.display='none';
  // Restore public navbar
  var pubNav=document.getElementById('public-navbar');if(pubNav)pubNav.style.display='flex';
  var topBar=document.getElementById('top-bar-public');if(topBar)topBar.style.display='block';
  document.getElementById('login-screen').style.display='flex';
  ['login-email','login-password'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('login-alert').style.display='none';
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  toast('Sesión cerrada','info');
}

// ===== NAVEGACIÓN =====
function showPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const pg=document.getElementById('page-'+id);
  if(pg){pg.classList.add('active');window.scrollTo(0,0);}
  updateCounters();
  renderCustomSections();
  if(id==='home'){ renderRoleHomeSection(); setTimeout(renderPublicEventos,200); setTimeout(renderSocialFeed,300); setTimeout(renderCarrerasPublic,100); }
  if(id==='galeria-public')    renderGaleriaPublic();
  if(id==='pagos-public')      { renderPagosPublic(); switchPagosTab('tab-tarifas'); }
  if(id==='reglamento-public') renderReglamentoPublic();
  if(id==='anuncios')          setTimeout(renderAnunciosPublic, 50);
  if(id==='blog')            setTimeout(renderBlogPublic, 50);
  if(id==='egresados')       setTimeout(renderEgresadosPublic, 50);
  // Restaurar bot FAB y portal FAB al navegar entre páginas
  if(APP.currentUser){
    var role=APP.currentUser.role;
    showPortalFab(role);
    showAllBotFabs(false);
    if(role==='estudiante'){
      var bc=APP.botConfig;
      showChatWidget(!bc||bc.accEst!==false);
    } else if(role==='padre'){
      showChatWidget(false);
      showBotFab('padre',true);
    } else if(role==='profesor'){
      showChatWidget(false);
      showBotFab('profe',true);
    } else if(role==='admin'){
      showChatWidget(false);
      showBotFab('admin',true);
    }
  }
}

function renderRoleHomeSection(){
  const el=document.getElementById('home-role-panel');
  if(!el||!APP.currentUser)return;
  const role=APP.currentUser.role;
  const name=APP.currentUser.name||'';
  const bg='background:linear-gradient(135deg,#1a2a50,#0d1f3e);padding:26px 20px;border-top:3px solid var(--gold);';
  const wrap='<div style="max-width:1100px;margin:0 auto;">';
  const grid='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:11px;">';
  const card=([fn,ico,label])=>`<div class="home-quick-card" onclick="${fn}">${ico}<span>${label}</span></div>`;
  const header=(ico,titulo)=>`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;"><h3 style="color:var(--gold);font-family:'Playfair Display',serif;font-size:19px;margin:0;">${ico} Bienvenido/a, ${name}</h3><span style="color:rgba(255,255,255,0.6);font-size:13px;">${titulo}</span></div>`;

  if(role==='admin'){
    el.innerHTML=`<div style="${bg}">${wrap}${header('🏫','Panel de Administración')}${grid}`+
    [["showPage('admin')","⚙️","Panel Admin"],["showAdminSection('dash-estudiantes')","🎓","Estudiantes"],["showAdminSection('dash-inscripciones')","📝","Inscripciones"],["showAdminSection('dash-notas')","📋","Notas"],["showAdminSection('dash-ausencias')","📅","Ausencias"],["showAdminSection('dash-pagos')","💰","Pagos"],["showAdminSection('dash-calendario')","🗓️","Calendario"],["showAdminSection('dash-notifs')","🔔","Notificar"],["showAdminSection('dash-anuncios')","📢","Anuncios"]].map(card).join('')+
    `</div></div></div>`;
  } else if(role==='profesor'){
    el.innerHTML=`<div style="${bg}">${wrap}${header('👨‍🏫','Portal del Maestro')}${grid}`+
    [["showPage('profesor')","👨‍🏫","Mi Panel"],["showPage('profesor');showProfeSection('profe-notas',null)","📋","Notas"],["showPage('profesor');showProfeSection('profe-ausencias',null)","📅","Ausencias"],["showPage('profesor');showProfeSection('profe-records',null)","📂","Récords"],["showPage('profesor');showProfeSection('profe-mensajes',null)","💬","Mensajes"]].map(card).join('')+
    `</div></div></div>`;
  } else if(role==='estudiante'){
    el.innerHTML=`<div style="${bg}">${wrap}${header('🎓','Portal del Estudiante')}${grid}`+
    [["showPage('estudiante')","🎓","Mi Portal"],["showPage('estudiante');showEstSection('est-notas')","📋","Mis Notas"],["showPage('estudiante');showEstSection('est-horario')","📆","Horario"],["showPage('estudiante');showEstSection('est-calendario')","🗓️","Calendario"],["showPage('estudiante');showEstSection('est-notifs')","🔔","Notificaciones"]].map(card).join('')+
    `</div></div></div>`;
  } else if(role==='padre'){
    el.innerHTML=`<div style="${bg}">${wrap}${header('👪','Portal de Padres')}${grid}`+
    [["showPage('padre')","👪","Mi Portal"],["showPage('padre');showPadreSection('padre-notas')","📋","Notas del Hijo/a"],["showPage('padre');showPadreSection('padre-calendario')","🗓️","Calendario"],["showPage('padre');showPadreSection('padre-mensajes-section');renderMensajes()","💬","Mensajes"],["showPage('padre');showPadreSection('padre-notifs-section')","🔔","Notificaciones"]].map(card).join('')+
    `</div></div></div>`;
  } else if(role==='enfermeria'){
    el.innerHTML=`<div style="${bg}">${wrap}${header('🏥','Departamento de Enfermería')}${grid}`+
    [["showPage('enfermeria')","🏥","Mi Panel"],["showPage('enfermeria');showEnferSection('enfer-registros');renderRegistrosEnfer()","📋","Consultas"],["openModal('modal-consulta');populateConsultaEstSelect()","➕","Nueva Consulta"],["showPage('enfermeria');showEnferSection('enfer-stock');renderStock()","💊","Stock"],["showPage('enfermeria');showEnferSection('enfer-estadisticas');renderEnferStats()","📊","Estadísticas"]].map(card).join('')+
    `</div></div></div>`;
  } else {
    el.innerHTML='';
  }
}

// ===== NOTIFICACIONES =====
function addNotif(msg){
  APP.notifications.unshift({id:Date.now(),msg,time:new Date().toLocaleTimeString('es-DO'),read:false});
  renderNotifs();
  document.getElementById('notif-dot').classList.add('show');
}
function toggleNotif(){document.getElementById('notif-panel').classList.toggle('open');}
function clearNotifs(){APP.notifications.forEach(n=>n.read=true);renderNotifs();document.getElementById('notif-dot').classList.remove('show');}
function renderNotifs(){
  const list=document.getElementById('notif-list');
  if(!list)return;
  if(!APP.notifications.length){list.innerHTML='<div class="notif-empty">Sin notificaciones</div>';return;}
  list.innerHTML=APP.notifications.map(n=>`<div class="notif-item ${n.read?'':'unread'}"><p>${n.msg}</p><span>${n.time}</span></div>`).join('');
  document.getElementById('notif-dot').classList.toggle('show',APP.notifications.some(n=>!n.read));
}

// ===== MODALS =====
function openModal(id){if(id==='modal-nota')populateStudentSelect();document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}

// ===== ANUNCIOS =====
function saveAnnouncement(){
  const tipo=document.getElementById('ann-tipo').value;
  const titulo=document.getElementById('ann-titulo').value.trim();
  const desc=document.getElementById('ann-desc').value.trim();
  const fecha=document.getElementById('ann-fecha').value;
  const imgEl=document.getElementById('ann-img-preview');
  if(!titulo||!desc){toast('Complete título y descripción','error');return;}
  APP.announcements.unshift({id:Date.now(),tipo,titulo,desc,fecha:fecha||new Date().toISOString().split('T')[0],img:imgEl.src&&imgEl.style.display!=='none'?imgEl.src:''});
  closeModal('modal-ann');
  persistSave();
  ['ann-titulo','ann-desc','ann-fecha'].forEach(f=>{const el=document.getElementById(f);if(el)el.value='';});
  document.getElementById('ann-img-preview').style.display='none';
  document.getElementById('ann-img-placeholder').style.display='block';
  renderAnnouncements();addNotif('📢 Nuevo anuncio: "'+titulo+'"');logAudit('anuncio','Anuncio publicado: "'+titulo+'"');toast('Anuncio publicado','success');
}
function renderAnnouncements(){
  const cards=APP.announcements.map(a=>`
    <div class="announcement-card">
      ${a.img?`<img src="${a.img}" class="ann-img" alt="">`:''}
      <div class="ann-header"><span class="ann-type ${a.tipo}">${a.tipo}</span><span class="ann-date">📅 ${a.fecha}</span></div>
      <div class="ann-body"><h3>${a.titulo}</h3><p>${a.desc}</p></div>
      <div class="ann-footer"><span>📌 C.E. Otilia Peláez</span></div>
    </div>`).join('');
  const empty='<p style="color:#888;grid-column:1/-1;text-align:center;padding:40px;">No hay anuncios.</p>';
  ['home-announcements','all-announcements'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=APP.announcements.length?cards:empty;});
  renderAdminAnnTable();updateCounters();
}
function renderAdminAnnTable(){
  const tbody=document.getElementById('admin-ann-body');
  if(!tbody)return;
  tbody.innerHTML=APP.announcements.map(a=>`<tr><td><span class="ann-type ${a.tipo}">${a.tipo}</span></td><td>${a.titulo}</td><td>${a.fecha}</td><td><button class="tbl-btn del" onclick="deleteAnn(${a.id})">🗑</button></td></tr>`).join('')||'<tr><td colspan="4" style="color:#888;text-align:center;padding:16px;">Sin anuncios</td></tr>';
}
function deleteAnn(id){APP.announcements=APP.announcements.filter(a=>a.id!==id);
  persistSave();renderAnnouncements();toast('Eliminado','info');}

// ===== ESTUDIANTES =====
function saveStudent(){
  const nombre=document.getElementById('st-nombre').value.trim();
  const apellido=document.getElementById('st-apellido').value.trim();
  const grado=document.getElementById('st-grado').value;
  const carrera=document.getElementById('st-carrera').value.trim();
  const email=document.getElementById('st-email').value.trim().toLowerCase();
  const pass=document.getElementById('st-pass').value;
  const telPadre=document.getElementById('st-tel-padre').value.trim();
  const emailPadre=document.getElementById('st-email-padre').value.trim().toLowerCase();
  if(!nombre||!apellido||!grado){toast('Complete los campos obligatorios','error');return;}
  const id='STU-'+String(APP.students.length+1).padStart(4,'0');
  const esSecundaria=grado.includes('Secundaria');
  APP.students.push({id,nombre,apellido,grado,carrera:carrera||'General',email,pass,esSecundaria,telPadre,emailPadre});
  closeModal('modal-student');
  ['st-nombre','st-apellido','st-grado','st-carrera','st-email','st-pass','st-tel-padre','st-email-padre'].forEach(f=>{const el=document.getElementById(f);if(el)el.value='';});
  renderStudentTable();addNotif('🎓 Nuevo estudiante: '+nombre+' '+apellido);toast('Estudiante agregado','success');
}
function renderStudentTable(){
  const tbody=document.getElementById('admin-st-body');
  if(!tbody)return;
  tbody.innerHTML=APP.students.map(s=>`<tr><td><strong>${s.nombre} ${s.apellido}</strong></td><td>${s.grado}</td><td><code style="background:#f0f0f0;padding:2px 6px;border-radius:4px;">${s.id}</code></td><td>${s.email||'—'}</td><td>${s.carrera}</td><td><button class="tbl-btn del" onclick="deleteStudent('${s.id}')">🗑</button></td></tr>`).join('')||'<tr><td colspan="6" style="color:#888;text-align:center;padding:16px;">Sin estudiantes</td></tr>';
  updateCounters();
}
function deleteStudent(id){APP.students=APP.students.filter(s=>s.id!==id);renderStudentTable();toast('Eliminado','info');}

// ===== NOTAS =====
function populateStudentSelect(){
  const sel=document.getElementById('nota-student');
  if(!sel)return;
  sel.innerHTML='<option value="">Seleccionar</option>'+APP.students.map(s=>`<option value="${s.id}">${s.nombre} ${s.apellido} — ${s.grado}</option>`).join('');
}
function saveNota(){
  const stId=document.getElementById('nota-student').value;
  const materia=document.getElementById('nota-materia').value.trim();
  const valor=parseInt(document.getElementById('nota-valor').value);
  const periodo=document.getElementById('nota-periodo').value;
  const anio=document.getElementById('nota-anio').value;
  if(!stId||!materia||isNaN(valor)){toast('Complete todos los campos','error');return;}
  const st=APP.students.find(s=>s.id===stId);
  const nota={id:Date.now(),studentId:stId,studentName:st?st.nombre+' '+st.apellido:stId,materia,valor,periodo,anio};
  APP.notas.push(nota);
  persistSave();closeModal('modal-nota');
  document.getElementById('nota-materia').value='';document.getElementById('nota-valor').value='';
  renderNotasTable();addNotif('📋 Nota: '+nota.studentName+' — '+materia+': '+valor);toast('Nota registrada','success');
}
function getGradeClass(v){if(v>=90)return'grade-A';if(v>=80)return'grade-B';if(v>=70)return'grade-C';return'grade-D';}
function renderNotasTable(){
  ['admin-notas-body','profe-notas-body'].forEach(id=>{
    const tbody=document.getElementById(id);
    if(!tbody)return;
    tbody.innerHTML=APP.notas.map(n=>`<tr><td>${n.studentName}</td><td>${n.materia}</td><td><span class="grade-badge ${getGradeClass(n.valor)}">${n.valor}</span></td><td>${n.periodo} ${n.anio}</td>${id==='admin-notas-body'?`<td><button class="tbl-btn del" onclick="deleteNota(${n.id})">🗑</button></td>`:''}</tr>`).join('')||'<tr><td colspan="5" style="color:#888;text-align:center;padding:16px;">Sin notas</td></tr>';
  });
  renderProfeRecords();
}
function deleteNota(id){APP.notas=APP.notas.filter(n=>n.id!==id);renderNotasTable();}
function renderProfeRecords(){
  const tbody=document.getElementById('profe-records-body');
  if(!tbody)return;
  tbody.innerHTML=APP.students.map(s=>{
    const sns=APP.notas.filter(n=>n.studentId===s.id);
    const avg=sns.length?Math.round(sns.reduce((a,b)=>a+b.valor,0)/sns.length):null;
    return`<tr><td>${s.nombre} ${s.apellido}</td><td>${s.grado}</td><td>${avg!==null?`<span class="grade-badge ${getGradeClass(avg)}">${avg}</span>`:'—'}</td><td><span class="badge badge-approved">Activo</span></td></tr>`;
  }).join('')||'<tr><td colspan="4" style="color:#888;text-align:center;padding:16px;">Sin estudiantes</td></tr>';
}

// ===== AUSENCIAS =====
function submitAusencia(){
  const student=document.getElementById('aus-student').value.trim();
  const fecha=document.getElementById('aus-fecha').value;
  const tipo=document.getElementById('aus-tipo').value;
  const motivo=document.getElementById('aus-motivo').value.trim();
  const docEl=document.getElementById('aus-doc-preview');
  if(!student||!fecha||!motivo){toast('Complete los campos requeridos','error');return;}
  APP.ausencias.push({id:Date.now(),student,fecha,tipo,motivo,doc:docEl&&docEl.src&&docEl.style.display!=='none'?docEl.src:'',status:'pending',by:(APP.currentUser && APP.currentUser.name)||'Padre'});
  closeModal('modal-ausencia');
  ['aus-student','aus-fecha','aus-motivo'].forEach(f=>{const el=document.getElementById(f);if(el)el.value='';});
  renderAusencias();addNotif('📅 Nueva ausencia: '+student);toast('Solicitud enviada','success');
}
function renderAusencias(){
  ['admin-ausencias-list','profe-ausencias-list'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    if(!APP.ausencias.length){el.innerHTML='<p style="color:#888;padding:16px;">Sin solicitudes.</p>';return;}
    el.innerHTML=APP.ausencias.map(a=>`
      <div class="ausencia-card">
        <div class="student-row"><span class="st-name">🎓 ${a.student}</span><span class="badge badge-${a.status==='approved'?'approved':a.status==='rejected'?'rejected':'pending'}">${a.status==='approved'?'Aprobada':a.status==='rejected'?'Rechazada':'Pendiente'}</span></div>
        <p style="font-size:13px;color:#666;margin-bottom:6px;"><strong>${a.tipo}</strong> — ${a.fecha}</p>
        <p style="font-size:13px;color:#666;">${a.motivo}</p>
        ${a.status==='pending'?`<div style="display:flex;gap:8px;margin-top:10px;"><button class="tbl-btn approve" onclick="updateAusencia(${a.id},'approved')">✅ Aprobar</button><button class="tbl-btn reject" onclick="updateAusencia(${a.id},'rejected')">❌ Rechazar</button></div>`:''}</div>`).join('');
  });
  updateCounters();
}
function updateAusencia(id,status){const a=APP.ausencias.find(x=>x.id===id);if(a){a.status=status;renderAusencias();toast('Ausencia '+(status==='approved'?'aprobada':'rechazada'),'success');}}

// ===== INSCRIPCIONES =====
function submitInscripcion(){
  const nombre=document.getElementById('ins-nombre').value.trim();
  const apellido=document.getElementById('ins-apellido').value.trim();
  const grado=document.getElementById('ins-grado').value;
  const padre=document.getElementById('ins-padre').value.trim();
  const tel=document.getElementById('ins-tel').value.trim();
  const photoEl=document.getElementById('photo-preview');
  if(!nombre||!apellido||!grado||!padre||!tel){toast('Complete los campos obligatorios *','error');return;}
  if(!photoEl||!photoEl.src||photoEl.style.display==='none'){toast('La foto del estudiante es obligatoria','error');return;}
  APP.inscripciones.push({
    id:Date.now(),nombre,apellido,grado,padre,tel,
    email:document.getElementById('ins-email').value.trim().toLowerCase(),
    photo:photoEl.src,status:'pending',
    createdAt:new Date().toLocaleDateString('es-DO'),
    escuelaAnterior:(document.getElementById('ins-escuela-anterior') && document.getElementById('ins-escuela-anterior').value.trim())||'',
    gradoAnterior:(document.getElementById('ins-grado-anterior') && document.getElementById('ins-grado-anterior').value.trim())||'',
    indice:(document.getElementById('ins-indice') && document.getElementById('ins-indice').value.trim())||'',
    motivoCambio:(document.getElementById('ins-motivo-cambio') && document.getElementById('ins-motivo-cambio').value.trim())||''
  });
  ['ins-nombre','ins-apellido','ins-fecha','ins-sexo','ins-grado','ins-cedula','ins-direccion','ins-padre','ins-tel','ins-email','ins-obs'].forEach(f=>{const el=document.getElementById(f);if(el)el.value='';});
  if(photoEl){photoEl.style.display='none';document.getElementById('photo-placeholder').style.display='block';}
  renderInscripciones();addNotif('📝 Nueva inscripción: '+nombre+' '+apellido);toast('¡Inscripción enviada!','success');
}
function renderInscripciones(){
  const el=document.getElementById('admin-inscripciones-list');
  if(!el)return;
  if(!APP.inscripciones.length){el.innerHTML='<p style="color:#888;padding:16px;">Sin inscripciones.</p>';return;}
  el.innerHTML=`<table class="data-table"><thead><tr><th>Foto</th><th>Nombre</th><th>Grado</th><th>Tutor</th><th>Esc. Anterior</th><th>Índice</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>`+
    APP.inscripciones.map(i=>`<tr>
      <td><img src="${i.photo}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid var(--gold);"></td>
      <td><strong>${i.nombre} ${i.apellido}</strong></td><td>${i.grado}</td><td>${i.padre}</td>
      <td style="font-size:12px;">${i.escuelaAnterior||'—'}</td>
      <td><span class="grade-badge ${i.indice?getGradeClass(parseInt(i.indice)||0):'grade-B'}">${i.indice||'—'}</span></td>
      <td>${i.createdAt}</td>
      <td><span class="badge badge-${i.status==='approved'?'approved':i.status==='rejected'?'rejected':'pending'}">${i.status==='approved'?'Aprobada':i.status==='rejected'?'Rechazada':'Pendiente'}</span></td>
      <td>${i.status==='pending'?`<button class="tbl-btn approve" onclick="approveInsc(${i.id})">✅</button><button class="tbl-btn reject" onclick="rejectInsc(${i.id})">❌</button>`:''}</td>
    </tr>`).join('')+'</tbody></table>';
  updateCounters();
}
function approveInsc(id){const i=APP.inscripciones.find(x=>x.id===id);if(i){i.status='approved';renderInscripciones();addNotif('✅ Inscripción aprobada: '+i.nombre+' '+i.apellido);toast('Aprobada','success');}}
function rejectInsc(id){const i=APP.inscripciones.find(x=>x.id===id);if(i){i.status='rejected';renderInscripciones();toast('Rechazada','info');}}

// ===== REPORTES =====
function submitReporte(){
  const asunto=document.getElementById('rep-asunto').value.trim();
  const msg=document.getElementById('rep-msg').value.trim();
  if(!msg){toast('Escriba su mensaje','error');return;}
  APP.reportes.push({id:Date.now(),from:(APP.currentUser && APP.currentUser.name)||'Estudiante',asunto,msg,date:new Date().toLocaleDateString('es-DO')});
  closeModal('modal-reporte');
  document.getElementById('rep-asunto').value='';document.getElementById('rep-msg').value='';
  renderReportes();addNotif('📨 Reporte de: '+((APP.currentUser && APP.currentUser.name)||'Estudiante'));toast('Reporte enviado','success');
}
function renderReportes(){
  const el=document.getElementById('admin-reportes-list');
  if(!el)return;
  if(!APP.reportes.length){el.innerHTML='<p style="color:#888;padding:16px;">Sin reportes.</p>';return;}
  el.innerHTML=`<table class="data-table"><thead><tr><th>De</th><th>Asunto</th><th>Mensaje</th><th>Fecha</th></tr></thead><tbody>`+
    APP.reportes.map(r=>`<tr><td>${r.from}</td><td>${r.asunto||'Sin asunto'}</td><td style="max-width:200px;">${r.msg}</td><td>${r.date}</td></tr>`).join('')+'</tbody></table>';
}

// ===== MENSAJES PROFESOR <-> PADRE =====
function openMensajeModal(para){
  const sel=document.getElementById('msg-para');
  if(sel&&para)sel.value=para;
  openModal('modal-mensaje');
}
function toggleReunionFecha(){
  const tipo=document.getElementById('msg-tipo').value;
  const wrap=document.getElementById('reunion-fecha-wrap');
  if(wrap)wrap.style.display=tipo==='reunion'?'block':'none';
}
function sendMensaje(){
  const para=document.getElementById('msg-para').value.trim();
  const asunto=document.getElementById('msg-asunto').value.trim();
  const texto=document.getElementById('msg-texto').value.trim();
  const tipo=document.getElementById('msg-tipo').value;
  const fechaR=(document.getElementById('msg-fecha-reunion') && document.getElementById('msg-fecha-reunion').value)||'';
  if(!para||!texto){toast('Complete destinatario y mensaje','error');return;}
  const msg={id:Date.now(),de:APP.currentUser.name,deRol:APP.currentUser.role,para,asunto:asunto||'Sin asunto',texto,tipo,fechaReunion:fechaR,fecha:new Date().toLocaleDateString('es-DO'),hora:new Date().toLocaleTimeString('es-DO'),leido:false};
  APP.mensajes.push(msg);
  closeModal('modal-mensaje');
  ['msg-para','msg-asunto','msg-texto'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const fw=document.getElementById('reunion-fecha-wrap');if(fw)fw.style.display='none';
  renderMensajes();addNotif('💬 Mensaje de '+APP.currentUser.name+' para '+para);toast('Mensaje enviado','success');
}
function renderMensajes(){
  const role=(APP.currentUser && APP.currentUser.role);
  const name=(APP.currentUser && APP.currentUser.name)||'';
  ['profe-mensajes-list','admin-mensajes-list','padre-mensajes-list'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    const myMsgs=APP.mensajes.filter(m=>{
      if(role==='admin')return true;
      if(role==='profesor')return m.de===name||m.para===name||m.deRol==='padre';
      if(role==='padre')return m.de===name||m.para===name||m.para==='Todos los padres';
      return false;
    });
    if(!myMsgs.length){el.innerHTML='<p style="color:#888;padding:14px;font-size:13px;">Sin mensajes.</p>';return;}
    el.innerHTML=myMsgs.map(m=>`
      <div class="mensaje-card ${m.leido?'':'unread-msg'}" onclick="markRead(${m.id})">
        <div class="msg-header"><span class="msg-tipo ${m.tipo}">${m.tipo==='reunion'?'📅 Reunión':m.tipo==='urgente'?'🚨 Urgente':'💬 Mensaje'}</span><span class="msg-fecha">${m.fecha} ${m.hora}</span></div>
        <div class="msg-body"><strong>De:</strong> ${m.de} → <strong>Para:</strong> ${m.para}<br><strong>Asunto:</strong> ${m.asunto}${m.tipo==='reunion'&&m.fechaReunion?`<br><strong>📅 Fecha:</strong> ${m.fechaReunion}`:''}<p style="margin-top:7px;">${m.texto}</p></div>
        ${!m.leido?'<span class="msg-unread-dot">●</span>':''}
      </div>`).join('');
  });
  renderContactosPadres();
}
function renderContactosPadres(){
  const el=document.getElementById('profe-contactos-list');if(!el)return;
  const contacts=[];
  APP.padres.forEach(p=>contacts.push({name:p.nombre+' '+p.apellido,role:'Padre/Tutor',hijo:p.hijo}));
  APP.inscripciones.forEach(i=>{if(i.padre&&!contacts.find(c=>c.name===i.padre))contacts.push({name:i.padre,role:'Tutor de '+i.nombre+' '+i.apellido});});
  if(!contacts.length){el.innerHTML='<p style="color:#888;font-size:13px;padding:8px;">No hay padres registrados.</p>';return;}
  el.innerHTML=contacts.map(c=>`
    <div class="chat-contact" onclick="openMensajeModal('${c.name}')">
      <div class="cc-avatar">${c.name.charAt(0).toUpperCase()}</div>
      <div><div class="cc-name">${c.name}</div><div class="cc-role">${c.role}</div></div>
      <span class="cc-arrow">Enviar →</span>
    </div>`).join('');
}
function markRead(id){const m=APP.mensajes.find(x=>x.id===id);if(m)m.leido=true;}

// ===== PORTALES =====
function renderEstudianteData(studentId){
  const st=APP.students.find(s=>s.id===studentId);
  if(st){
    const nameEl=document.getElementById('st-name-display');if(nameEl)nameEl.textContent=st.nombre+' '+st.apellido;
    const gradeEl=document.getElementById('st-grade-display');if(gradeEl)gradeEl.textContent='Grado: '+st.grado;
    const careerEl=document.getElementById('st-career-display');
    if(careerEl){
      if(st.esSecundaria&&st.carrera){careerEl.textContent='Carrera: '+st.carrera;careerEl.style.display='inline-block';}
      else careerEl.style.display='none';
    }
    // Perfil academico
    const pNombre=document.getElementById('perfil-nombre');if(pNombre)pNombre.textContent=st.nombre+' '+st.apellido;
    const pGrado=document.getElementById('perfil-grado');if(pGrado)pGrado.textContent=st.grado;
    const pEmail=document.getElementById('perfil-email');if(pEmail)pEmail.textContent=st.email||'—';
    const pTelPadre=document.getElementById('perfil-tel-padre');if(pTelPadre)pTelPadre.textContent=st.telPadre||'—';
    const pEmailPadre=document.getElementById('perfil-email-padre');if(pEmailPadre)pEmailPadre.textContent=st.emailPadre||'—';
    const carreraRow=document.getElementById('perfil-carrera-row');
    if(carreraRow){
      if(st.esSecundaria){carreraRow.style.display='flex';document.getElementById('perfil-carrera').textContent=st.carrera||'General';}
      else carreraRow.style.display='none';
    }
  }
  renderEstudianteNotas(studentId);
  showEstudianteSection('est-notas');
  // Load extra info if saved
  if(estExtraData&&estExtraData[studentId]) renderEstExtraInfo(studentId);
}
function renderEstudianteNotas(studentId){
  const myNotas=APP.notas.filter(n=>n.studentId===studentId);
  const avg=myNotas.length?Math.round(myNotas.reduce((a,b)=>a+b.valor,0)/myNotas.length):null;
  const gpaEl=document.getElementById('st-gpa');if(gpaEl)gpaEl.textContent=avg!==null?avg:'—';
  const list=document.getElementById('st-subjects-list');
  if(list)list.innerHTML=myNotas.length?myNotas.map(n=>`<li class="subject-item"><span class="subject-name">${n.materia}</span><div class="subject-grade-bar"><div class="bar-track"><div class="bar-fill" style="width:${n.valor}%"></div></div><span class="grade-badge ${getGradeClass(n.valor)}">${n.valor}</span><span style="font-size:11px;color:#999;">${n.periodo}</span></div></li>`).join(''):'<li style="color:#888;padding:20px;text-align:center;">Sin notas.</li>';
}
function showEstudianteSection(id){
  document.querySelectorAll('#page-estudiante .est-section').forEach(s=>s.classList.remove('active'));
  const sec=document.getElementById(id);if(sec)sec.classList.add('active');
  document.querySelectorAll('#page-estudiante .est-tab').forEach(t=>t.classList.remove('active'));
  const tab=document.querySelector(`[data-est="${id}"]`);if(tab)tab.classList.add('active');
}
function renderPadreExcusas(){
  if(!APP.currentUser)return;
  var padre=APP.padres.find(function(p){return p.email===APP.currentUser.email;});
  var childName=padre?padre.hijo:(APP.currentUser.child||'');
  var misExcusas=APP.ausencias.filter(function(a){
    return a.by===APP.currentUser.name||
      (childName&&a.student&&a.student.toLowerCase().includes(childName.split(' ')[0].toLowerCase()));
  });
  var el=document.getElementById('padre-excusas-historial');
  if(!el)return;
  if(!misExcusas.length){el.innerHTML='<p style="color:#888;font-size:13px;">No has enviado excusas aún.</p>';return;}
  var statusColors={pending:'#f59e0b',approved:'#22c55e',rejected:'#ef4444'};
  var statusLabels={pending:'⏳ Pendiente',approved:'✅ Aprobada',rejected:'❌ Rechazada'};
  el.innerHTML=misExcusas.map(function(a){
    var color=statusColors[a.status]||'#888';
    var label=statusLabels[a.status]||a.status;
    return '<div style="border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">'+
      '<div><p style="font-weight:700;font-size:14px;margin:0 0 4px;">'+a.student+'</p>'+
      '<p style="font-size:12px;color:#666;margin:0;">'+a.tipo+' · '+a.fecha+'</p>'+
      '<p style="font-size:12px;color:#888;margin:4px 0 0;">'+a.motivo+'</p></div>'+
      '<span style="background:'+color+'22;color:'+color+';border:1px solid '+color+';border-radius:20px;padding:4px 12px;font-size:12px;font-weight:700;">'+label+'</span>'+
      '</div>';
  }).join('');
}

function renderPadreAusencias(){
  if(!APP.currentUser)return;
  var padre=APP.padres.find(function(p){return p.email===APP.currentUser.email;});
  var childName=padre?padre.hijo:(APP.currentUser.child||'');
  var ausencias=APP.ausencias.filter(function(a){
    return childName&&a.student&&a.student.toLowerCase().includes(childName.split(' ')[0].toLowerCase());
  });
  var el=document.getElementById('padre-ausencias-list-view');
  if(!el)return;
  if(!ausencias.length){el.innerHTML='<p style="color:#888;font-size:13px;">Sin ausencias registradas.</p>';return;}
  var total=ausencias.length;
  var aprobadas=ausencias.filter(function(a){return a.status==='approved';}).length;
  var pendientes=ausencias.filter(function(a){return a.status==='pending';}).length;
  var statusColors={pending:'#f59e0b',approved:'#22c55e',rejected:'#ef4444'};
  var statusLabels={pending:'⏳ Pendiente',approved:'✅ Justificada',rejected:'❌ Sin justificar'};
  el.innerHTML=
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px;">'+
      '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:900;color:#16a34a;">'+aprobadas+'</div><div style="font-size:11px;color:#166534;">Justificadas</div></div>'+
      '<div style="background:#fefce8;border:1px solid #fde047;border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:900;color:#ca8a04;">'+pendientes+'</div><div style="font-size:11px;color:#713f12;">Pendientes</div></div>'+
      '<div style="background:#f8fafc;border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:900;color:var(--navy);">'+total+'</div><div style="font-size:11px;color:#666;">Total</div></div>'+
    '</div>'+
    ausencias.map(function(a){
      var color=statusColors[a.status]||'#888';
      var label=statusLabels[a.status]||a.status;
      return '<div style="border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">'+
        '<div><p style="font-weight:700;font-size:14px;margin:0 0 2px;">'+a.tipo+'</p>'+
        '<p style="font-size:12px;color:#666;margin:0;">📅 '+a.fecha+' · '+a.motivo+'</p></div>'+
        '<span style="background:'+color+'22;color:'+color+';border:1px solid '+color+';border-radius:20px;padding:4px 12px;font-size:12px;font-weight:700;">'+label+'</span>'+
        '</div>';
    }).join('');
}


function renderPadreData(user){
  const childName=padre?padre.hijo:user.child||'';
  const childEl=document.getElementById('padre-student-info');if(childEl)childEl.textContent=childName||'Comuníquese con la administración.';
  const childNotas=APP.notas.filter(n=>n.studentName&&childName&&n.studentName.toLowerCase().includes(childName.split(' ')[0].toLowerCase()));
  const notasList=document.getElementById('padre-notas-list');
  if(notasList)notasList.innerHTML=childNotas.length?childNotas.map(n=>`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);"><span style="font-size:13px;">${n.materia}</span><span class="grade-badge ${getGradeClass(n.valor)}">${n.valor}</span></div>`).join(''):'<p style="color:#888;font-size:13px;">Sin notas.</p>';
  renderMensajes();
  // No hacemos showPadreSection aquí — el padre ya va a home desde loginAs
}
function showPadreSection(id){
  document.querySelectorAll('#page-padre .padre-section').forEach(s=>s.classList.remove('active'));
  const sec=document.getElementById(id);if(sec)sec.classList.add('active');
  // Actualizar datos automáticamente al navegar
  if(APP.currentUser){
    if(id==='padre-perfil'||id==='padre-inicio') fillPadrePerfil(APP.currentUser);
    if(id==='padre-notas')    renderPadreNotas(APP.currentUser);
    if(id==='padre-ausencias-view') renderPadreAusencias();
  }
}

function renderAdminData(){renderAnnouncements();renderStudentTable();renderNotasTable();renderAusencias();renderInscripciones();renderReportes();renderMensajes();renderCustomSections();updateCounters();setTimeout(renderDashboardGraficas,300);}
function renderProfesorData(){populateStudentSelect();renderNotasTable();renderAusencias();renderProfeRecords();renderMensajes();populateAsistGrado();}

function populateAsistGrado(){
  var sel = document.getElementById('asist-grado');
  if(!sel) return;
  // Limpiar opciones excepto la primera
  while(sel.options.length > 1) sel.remove(1);
  // Obtener grados únicos
  var grados = [...new Set((APP.students||[]).map(function(s){ return s.grado; }))].sort();
  grados.forEach(function(g){
    var o = document.createElement('option');
    o.value = g; o.textContent = g;
    sel.appendChild(o);
  });
  // Set today's date by default
  var fechaEl = document.getElementById('asist-fecha');
  if(fechaEl && !fechaEl.value) fechaEl.value = new Date().toISOString().split('T')[0];
}

// ===== TABS =====
function showDashSection(id,el){
  document.querySelectorAll('#page-admin .dash-section').forEach(s=>s.classList.remove('active'));
  const sec=document.getElementById(id);if(sec)sec.classList.add('active');
  document.querySelectorAll('#page-admin .dash-tab').forEach(t=>t.classList.remove('active'));
  if(el)el.classList.add('active');
  const refreshMap={'dash-notas':renderNotasTable,'dash-ausencias':renderAusencias,'dash-inscripciones':renderInscripciones,'dash-reportes':renderReportes,'dash-mensajes':renderMensajes,'dash-custom':renderAdminCustomList,'dash-estudiantes':renderStudentTable};
  if(refreshMap[id])refreshMap[id]();
}
function showProfeSection(id,el){
  document.querySelectorAll('#page-profesor .dash-section').forEach(s=>s.classList.remove('active'));
  const sec=document.getElementById(id);if(sec)sec.classList.add('active');
  document.querySelectorAll('#page-profesor .dash-tab').forEach(t=>t.classList.remove('active'));
  if(el)el.classList.add('active');
  if(id==='profe-mensajes')renderMensajes();
}

// ===== CUSTOM SECTIONS =====
function saveCustomSection(){
  var titulo=(document.getElementById('cs-titulo')&&document.getElementById('cs-titulo').value.trim())||'';
  var subtitulo=(document.getElementById('cs-subtitulo')&&document.getElementById('cs-subtitulo').value.trim())||'';
  var contenido=(document.getElementById('cs-contenido')&&document.getElementById('cs-contenido').innerHTML.trim())||'';
  var color=(document.getElementById('cs-color-pick')&&document.getElementById('cs-color-pick').value)||'#16213E';
  var layout=(document.getElementById('cs-layout')&&document.getElementById('cs-layout').value)||'full';
  var imgEl=document.getElementById('cs-img-preview');
  if(!titulo||!contenido||contenido==='<br>'){toast('Complete título y contenido','error');return;}
  if(!APP.customSections)APP.customSections=[];
  APP.customSections.push({id:Date.now(),titulo,subtitulo,contenido,color,layout,img:imgEl&&imgEl.style.display!=='none'?imgEl.src:''});
  var tEl=document.getElementById('cs-titulo');if(tEl)tEl.value='';
  var stEl=document.getElementById('cs-subtitulo');if(stEl)stEl.value='';
  var cEl=document.getElementById('cs-contenido');if(cEl)cEl.innerHTML='';
  if(imgEl){imgEl.style.display='none';var ph=document.getElementById('cs-img-placeholder');if(ph)ph.style.display='block';}
  var prevBox=document.getElementById('cs-preview-box');if(prevBox)prevBox.style.display='none';
  renderCustomSections();renderAdminCustomList();toast('Sección publicada','success');
}
function renderCustomSections(){
  var el=document.getElementById('custom-sections-container');if(!el)return;
  if(!APP.customSections||!APP.customSections.length){el.innerHTML='';return;}
  el.innerHTML=APP.customSections.map(function(s){return buildCustomSectionHTML(s);}).join('');
}
function renderAdminCustomList(){
  const el=document.getElementById('admin-custom-list');if(!el)return;
  if(!APP.customSections||!APP.customSections.length){el.innerHTML='<p style="color:#888;padding:14px;">Sin secciones creadas.</p>';return;}
  el.innerHTML=APP.customSections.map(s=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--white);">
      <div><strong style="font-size:14px;">${s.titulo}</strong><p style="font-size:12px;color:#888;margin-top:2px;">${s.contenido.substring(0,60)}...</p></div>
      <button class="tbl-btn del" onclick="deleteCustomSection(${s.id})">🗑</button>
    </div>`).join('');
}
function deleteCustomSection(id){APP.customSections=APP.customSections.filter(s=>s.id!==id);renderCustomSections();renderAdminCustomList();toast('Sección eliminada','info');}

// ===== PROFESOR MODAL =====
function openProfesorModal(){
  document.getElementById('modal-profesor-login').classList.add('open');
  toggleProfTab('login');
}

function toggleProfTab(tab){
  var loginForm=document.getElementById('prof-form-login');
  var regForm=document.getElementById('prof-form-register');
  var btnLogin=document.getElementById('prof-tab-login');
  var btnReg=document.getElementById('prof-tab-register');
  var actionBtn=document.getElementById('prof-modal-btn');
  var alertEl=document.getElementById('prof-login-alert');
  if(alertEl)alertEl.style.display='none';
  if(tab==='login'){
    if(loginForm)loginForm.style.display='block';
    if(regForm)regForm.style.display='none';
    if(btnLogin){btnLogin.style.background='var(--navy)';btnLogin.style.color='white';}
    if(btnReg){btnReg.style.background='white';btnReg.style.color='var(--navy)';}
    if(actionBtn){actionBtn.textContent='🔐 Entrar';actionBtn.onclick=doProfesorLogin;}
  } else {
    if(loginForm)loginForm.style.display='none';
    if(regForm)regForm.style.display='block';
    if(btnLogin){btnLogin.style.background='white';btnLogin.style.color='var(--navy)';}
    if(btnReg){btnReg.style.background='var(--navy)';btnReg.style.color='white';}
    if(actionBtn){actionBtn.textContent='📝 Crear mi Cuenta';actionBtn.onclick=doProfesorRegister;}
  }
}

function doProfesorLogin(){
  var email=(document.getElementById('prof-login-email')&&document.getElementById('prof-login-email').value.trim().toLowerCase())||'';
  var pass=(document.getElementById('prof-login-pass')&&document.getElementById('prof-login-pass').value)||'';
  var alertEl=document.getElementById('prof-login-alert');
  if(!email||!pass){alertEl.textContent='Ingrese correo y contraseña.';alertEl.style.display='block';return;}
  // Check cuenta dedicada de profesor (legacy)
  if(email===APP.accounts.profesor.email.toLowerCase()&&pass===APP.accounts.profesor.password){
    document.getElementById('modal-profesor-login').classList.remove('open');
    loginAs({role:'profesor',name:'Profesor(a)',email});return;
  }
  // Check cuentas personales registradas
  if(!APP.profesores)APP.profesores=[];
  var prof=APP.profesores.find(function(p){return p.email&&p.email.toLowerCase()===email&&p.pass===pass;});
  if(!prof){alertEl.textContent='Correo o contraseña incorrectos. Si no tienes cuenta, usa la pestaña "Crear mi Cuenta".';alertEl.style.display='block';return;}
  document.getElementById('modal-profesor-login').classList.remove('open');
  loginAs({role:'profesor',name:prof.nombre+' '+prof.apellido,email:prof.email,profId:prof.id});
}

function doProfesorRegister(){
  var codigoDedicado=(document.getElementById('prof-reg-codigo')&&document.getElementById('prof-reg-codigo').value.trim().toLowerCase())||'';
  var nombre=(document.getElementById('prof-reg-nombre')&&document.getElementById('prof-reg-nombre').value.trim())||'';
  var apellido=(document.getElementById('prof-reg-apellido')&&document.getElementById('prof-reg-apellido').value.trim())||'';
  var email=(document.getElementById('prof-reg-email')&&document.getElementById('prof-reg-email').value.trim().toLowerCase())||'';
  var pass=(document.getElementById('prof-reg-pass')&&document.getElementById('prof-reg-pass').value)||'';
  var confirm=(document.getElementById('prof-reg-confirm')&&document.getElementById('prof-reg-confirm').value)||'';
  var alertEl=document.getElementById('prof-login-alert');
  if(!codigoDedicado||!nombre||!email||!pass||!confirm){alertEl.textContent='Complete todos los campos.';alertEl.style.display='block';return;}
  // Verificar correo dedicado
  var codigosValidos=[APP.accounts.profesor.email.toLowerCase()];
  // También acepta correos dedicados extra que el admin haya configurado
  if(APP.correosDedicadosProf)APP.correosDedicadosProf.forEach(function(c){codigosValidos.push(c.toLowerCase());});
  if(!codigosValidos.includes(codigoDedicado)){alertEl.textContent='El correo dedicado de maestros no es válido. Solicítalo al administrador.';alertEl.style.display='block';return;}
  if(pass!==confirm){alertEl.textContent='Las contraseñas no coinciden.';alertEl.style.display='block';return;}
  if(pass.length<6){alertEl.textContent='La contraseña debe tener al menos 6 caracteres.';alertEl.style.display='block';return;}
  if(!APP.profesores)APP.profesores=[];
  if(APP.profesores.find(function(p){return p.email&&p.email.toLowerCase()===email;})){alertEl.textContent='Este correo ya tiene una cuenta registrada.';alertEl.style.display='block';return;}
  var prof={id:'PROF-'+Date.now(),nombre,apellido,email,pass};
  APP.profesores.push(prof);
  document.getElementById('modal-profesor-login').classList.remove('open');
  loginAs({role:'profesor',name:nombre+' '+apellido,email,profId:prof.id});
  toast('¡Cuenta creada! Bienvenido/a, '+nombre,'success');
}

// ===== PROFESOR ANUNCIOS =====
function previewProfeAnnImg(event){
  var file=event.target.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(e){
    var prev=document.getElementById('profe-ann-img-preview');
    var ph=document.getElementById('profe-ann-img-ph');
    if(prev){prev.src=e.target.result;prev.style.display='block';}
    if(ph)ph.style.display='none';
  };
  reader.readAsDataURL(file);
}

function saveProfeAnuncio(){
  var tipo=(document.getElementById('profe-ann-tipo')&&document.getElementById('profe-ann-tipo').value)||'aviso';
  var titulo=(document.getElementById('profe-ann-titulo')&&document.getElementById('profe-ann-titulo').value.trim())||'';
  var desc=(document.getElementById('profe-ann-desc')&&document.getElementById('profe-ann-desc').value.trim())||'';
  var fecha=(document.getElementById('profe-ann-fecha')&&document.getElementById('profe-ann-fecha').value)||new Date().toISOString().slice(0,10);
  var imgEl=document.getElementById('profe-ann-img-preview');
  if(!titulo||!desc)return toast('Completa título y descripción','error');
  APP.announcements.push({
    id:Date.now(),tipo,titulo,desc,fecha,
    img:imgEl&&imgEl.style.display!=='none'?imgEl.src:'',
    autor:APP.currentUser&&APP.currentUser.name||'Maestro/a',
    porProfe:true
  });
  // Clear
  ['profe-ann-titulo','profe-ann-desc'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  if(imgEl){imgEl.style.display='none';imgEl.src='';var ph=document.getElementById('profe-ann-img-ph');if(ph)ph.style.display='block';}
  renderProfeAnuncios();renderAnnouncements();updateCounters();
  toast('Anuncio publicado','success');
}

function renderProfeAnuncios(){
  var lista=document.getElementById('profe-ann-lista');if(!lista)return;
  var mios=APP.announcements.filter(function(a){return a.porProfe&&APP.currentUser&&a.autor===APP.currentUser.name;});
  if(!mios.length){lista.innerHTML='<p style="color:#888;font-size:13px;">No has publicado anuncios aún.</p>';return;}
  var tipos={aviso:'🔔',evento:'📅',info:'ℹ️',urgente:'🚨'};
  lista.innerHTML=mios.map(function(a){
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:white;">'+
      '<div><span style="font-size:16px;">'+(tipos[a.tipo]||'📢')+'</span> <strong>'+a.titulo+'</strong> <small style="color:#888;">'+a.fecha+'</small></div>'+
      '<button class="btn-del-nivel" onclick="deleteProfeAnn('+a.id+')">🗑 Borrar</button>'+
    '</div>';
  }).join('');
}

function deleteProfeAnn(id){
  APP.announcements=APP.announcements.filter(function(a){return a.id!==id;});
  renderProfeAnuncios();renderAnnouncements();updateCounters();
  toast('Anuncio eliminado','info');
}

// ===== CONFIG TABS =====
function showCfgTab(id,btn){
  document.querySelectorAll('.cfg-section').forEach(function(s){s.classList.remove('active');});
  document.querySelectorAll('.cfg-tab').forEach(function(b){b.classList.remove('active');});
  var sec=document.getElementById(id);if(sec)sec.classList.add('active');
  if(btn)btn.classList.add('active');
}

function applyCfgHero(){
  APP.cfgHero=APP.cfgHero||{};
  // Save all hero fields
  var hf={'cfg-hero-title':'title','cfg-hero-subtitle-gold':'gold','cfg-hero-desc':'desc','cfg-hero-badge':'badge','cfg-stat1-num':'stat1n','cfg-stat1-lbl':'stat1l','cfg-stat2-num':'stat2n','cfg-stat2-lbl':'stat2l'};
  Object.keys(hf).forEach(function(id){var el=document.getElementById(id);if(el)APP.cfgHero[hf[id]]=el.value;});
  var title=document.getElementById('cfg-hero-title');
  var gold=document.getElementById('cfg-hero-subtitle-gold');
  var desc=document.getElementById('cfg-hero-desc');
  var badge=document.getElementById('cfg-hero-badge');
  var h1=document.querySelector('#hero h1');
  if(h1&&title&&gold)h1.innerHTML=(title.value||'Centro Educativo')+'<br><span>'+(gold.value||'Otilia Peláez')+'</span>';
  var sub=document.querySelector('#hero .hero-sub');
  if(sub&&desc)sub.textContent=desc.value;
  var badgeEl=document.querySelector('#hero .hero-badge');
  if(badgeEl&&badge)badgeEl.textContent=badge.value;
  // Stats
  var s1n=document.getElementById('cfg-stat1-num');var s1l=document.getElementById('cfg-stat1-lbl');
  var s2n=document.getElementById('cfg-stat2-num');var s2l=document.getElementById('cfg-stat2-lbl');
  var stats=document.querySelectorAll('#hero .stat-item');
  if(stats[0]&&s1n){stats[0].querySelector('.num').textContent=s1n.value;stats[0].querySelector('.lbl').textContent=s1l&&s1l.value||'';}
  if(stats[1]&&s2n){stats[1].querySelector('.num').textContent=s2n.value;stats[1].querySelector('.lbl').textContent=s2l&&s2l.value||'';}
  toast('Hero actualizado','success');
}

function setCfgHeroImg(event){
  var file=event.target.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(e){
    var prev=document.getElementById('cfg-hero-img-preview');
    var ph=document.getElementById('cfg-hero-img-ph');
    if(prev){prev.src=e.target.result;prev.style.display='block';}
    if(ph)ph.style.display='none';
    var hero=document.getElementById('hero');
    if(hero)hero.style.backgroundImage='url('+e.target.result+')';
    toast('Imagen del hero aplicada','success');
  };
  reader.readAsDataURL(file);
}

function applyCfgMision(){
  var mt=document.getElementById('cfg-mision-titulo');var mx=document.getElementById('cfg-mision-txt');
  var vt=document.getElementById('cfg-vision-titulo');var vx=document.getElementById('cfg-vision-txt');
  var vlt=document.getElementById('cfg-valores-titulo');var vlx=document.getElementById('cfg-valores-txt');
  var cards=document.querySelectorAll('.mvv-card');
  if(cards[0]){cards[0].querySelector('h4').textContent=mt&&mt.value||'Misión';cards[0].querySelector('p').textContent=mx&&mx.value||'';}
  if(cards[1]){cards[1].querySelector('h4').textContent=vt&&vt.value||'Visión';cards[1].querySelector('p').textContent=vx&&vx.value||'';}
  if(cards[2]){cards[2].querySelector('h4').textContent=vlt&&vlt.value||'Valores';cards[2].querySelector('p').textContent=vlx&&vlx.value||'';}
  var valorCards=document.querySelectorAll('.valor-card');
  if(valorCards[0]){valorCards[0].querySelector('h4').textContent=mt&&mt.value||'Misión';valorCards[0].querySelector('p').textContent=mx&&mx.value||'';}
  if(valorCards[1]){valorCards[1].querySelector('h4').textContent=vt&&vt.value||'Visión';valorCards[1].querySelector('p').textContent=vx&&vx.value||'';}
  toast('Misión y Visión actualizadas','success');
}

function applyCfgNiveles(){
  var rows=document.querySelectorAll('#niveles-editor .nivel-edit-row');
  var container=document.querySelector('#page-home .nivel-card');
  if(!container){toast('Aplicado — se reflejará en la página','info');return;}
  var parent=container.closest('[style*="grid"]');if(!parent)return;
  parent.innerHTML=Array.from(rows).map(function(row){
    var ico=row.querySelector('.nivel-icon-in').value||'📚';
    var tit=row.querySelector('.nivel-title-in').value||'Nivel';
    var desc=row.querySelector('.nivel-desc-in').value||'';
    return '<div class="nivel-card"><div class="nivel-icon">'+ico+'</div><h4>'+tit+'</h4><p style="font-size:13px;color:rgba(255,255,255,0.75);">'+desc+'</p><button class="btn btn-gold" style="width:100%;margin-top:12px;" onclick="showPage(\'inscripcion\')">Inscribirse →</button></div>';
  }).join('');
  toast('Oferta académica actualizada','success');
}

function addNivel(){
  var row=document.createElement('div');row.className='nivel-edit-row';
  row.innerHTML='<input type="text" placeholder="Ícono" class="nivel-icon-in" value="📚"><input type="text" placeholder="Título" class="nivel-title-in"><textarea placeholder="Descripción" class="nivel-desc-in" rows="2"></textarea><button class="btn-del-nivel" onclick="delNivel(this)">✕</button>';
  document.getElementById('niveles-editor').appendChild(row);
}
function delNivel(btn){btn.closest('.nivel-edit-row').remove();}

function applyCfgInstalaciones(){
  var rows=document.querySelectorAll('#instalaciones-editor .inst-edit-row');
  var grid=document.querySelector('#page-home .instalacion-card');
  if(!grid){toast('Aplicado','info');return;}
  var parent=grid.closest('[style*="grid"]');if(!parent)return;
  parent.innerHTML=Array.from(rows).map(function(row){
    var ico=row.querySelector('.inst-icon-in').value||'🏫';
    var tit=row.querySelector('.inst-title-in').value||'';
    var desc=row.querySelector('.inst-desc-in').value||'';
    return '<div class="instalacion-card"><div style="font-size:36px;">'+ico+'</div><h5>'+tit+'</h5><p>'+desc+'</p></div>';
  }).join('');
  toast('Instalaciones actualizadas','success');
}
function addInst(){var row=document.createElement('div');row.className='inst-edit-row';row.innerHTML='<input type="text" class="inst-icon-in" value="🏫" placeholder="Ícono"><input type="text" class="inst-title-in" placeholder="Nombre"><input type="text" class="inst-desc-in" placeholder="Descripción"><button class="btn-del-nivel" onclick="delInst(this)">✕</button>';document.getElementById('instalaciones-editor').appendChild(row);}
function delInst(btn){btn.closest('.inst-edit-row').remove();}

function applyCfgCalendario(){
  var rows=document.querySelectorAll('#calendario-editor .cal-edit-row');
  var grid=document.getElementById('calendario-items');if(!grid)return;
  grid.innerHTML=Array.from(rows).map(function(row){
    var mes=row.querySelector('.cal-mes-in').value||'';
    var evt=row.querySelector('.cal-evento-in').value||'';
    var fecha=row.querySelector('.cal-fecha-in').value||'';
    return '<div class="cal-card"><div class="cal-mes">'+mes+'</div><div class="cal-evento">'+evt+'</div><div class="cal-fecha">'+fecha+'</div></div>';
  }).join('');
  toast('Calendario actualizado','success');
}
function addCalEvent(){var row=document.createElement('div');row.className='cal-edit-row';row.innerHTML='<input type="text" class="cal-mes-in" placeholder="Mes"><input type="text" class="cal-evento-in" placeholder="Evento"><input type="text" class="cal-fecha-in" placeholder="Fecha"><button class="btn-del-nivel" onclick="this.closest(\'.cal-edit-row\').remove()">✕</button>';document.getElementById('calendario-editor').appendChild(row);}

function applyCfgTestimonios(){
  var rows=document.querySelectorAll('#test-editor .test-edit-row');
  var grid=document.getElementById('testimonios-grid');if(!grid)return;
  grid.innerHTML=Array.from(rows).map(function(row){
    var emoji=row.querySelector('.test-emoji-in').value||'👤';
    var autor=row.querySelector('.test-autor-in').value||'';
    var rol=row.querySelector('.test-rol-in').value||'';
    var txt=row.querySelector('.test-txt-in').value||'';
    return '<div class="testimonio-card"><p class="test-texto">'+txt+'</p><div class="test-autor"><div class="test-avatar">'+emoji+'</div><div><strong>'+autor+'</strong><br><small>'+rol+'</small></div></div></div>';
  }).join('');
  toast('Testimonios actualizados','success');
}
function addTestimonio(){var row=document.createElement('div');row.className='test-edit-row';row.innerHTML='<input type="text" class="test-emoji-in" value="👤"><input type="text" class="test-autor-in" placeholder="Nombre"><input type="text" class="test-rol-in" placeholder="Rol/Relación"><textarea class="test-txt-in" rows="2" placeholder="Testimonio..."></textarea><button class="btn-del-nivel" onclick="this.closest(\'.test-edit-row\').remove()">✕</button>';document.getElementById('test-editor').appendChild(row);}

function applyCfgMaestros(){
  var rows=document.querySelectorAll('#maestros-editor .maest-edit-row');
  var grid=document.getElementById('maestros-grid');if(!grid)return;
  grid.innerHTML=Array.from(rows).map(function(row){
    var emoji=row.querySelector('.maest-emoji-in').value||'👨‍🏫';
    var nombre=row.querySelector('.maest-nombre-in').value||'Maestro/a';
    var cargo=row.querySelector('.maest-cargo-in').value||'';
    var desc=row.querySelector('.maest-desc-in').value||'';
    return '<div class="maestro-card"><div class="maestro-foto">'+emoji+'</div><h4>'+nombre+'</h4><span class="maestro-cargo">'+cargo+'</span><p>'+desc+'</p></div>';
  }).join('');
  toast('Página de maestros actualizada','success');
}
function addMaestroEditor(){var row=document.createElement('div');row.className='maest-edit-row';row.innerHTML='<input type="text" class="maest-emoji-in" value="👨‍🏫"><input type="text" class="maest-nombre-in" placeholder="Nombre completo"><input type="text" class="maest-cargo-in" placeholder="Cargo/Materia"><textarea class="maest-desc-in" rows="2" placeholder="Descripción..."></textarea><button class="btn-del-nivel" onclick="this.closest(\'.maest-edit-row\').remove()">✕</button>';document.getElementById('maestros-editor').appendChild(row);}

function applyCfgFooter(){
  APP.cfgFooter=APP.cfgFooter||{};
  var ff={'cfg-facebook':'facebook','cfg-whatsapp':'whatsapp','cfg-instagram':'instagram','cfg-youtube':'youtube','cfg-footer-copy':'copy','cfg-maps':'maps'};
  Object.keys(ff).forEach(function(id){var el=document.getElementById(id);if(el)APP.cfgFooter[ff[id]]=el.value;});
  var fb=document.getElementById('cfg-facebook');
  var wa=document.getElementById('cfg-whatsapp');
  var copy=document.getElementById('cfg-footer-copy');
  if(fb){document.querySelectorAll('a[href*="facebook"]').forEach(function(a){if(fb.value)a.href=fb.value;});}
  if(wa){document.querySelectorAll('a[href*="wa.me"]').forEach(function(a){if(wa.value)a.href='https://wa.me/'+wa.value;});}
  var footerBottom=document.querySelector('.footer-bottom');
  if(footerBottom&&copy&&copy.value)footerBottom.textContent=copy.value;
  toast('Footer y redes actualizados','success');
}

function liveUpdate(fieldId){
  var val=(document.getElementById(fieldId)&&document.getElementById(fieldId).value.trim())||'';
  if(fieldId==='cfg-director'){var el=document.getElementById('director-name-display');if(el)el.textContent=val;}
  if(fieldId==='cfg-phone'){document.querySelectorAll('[data-cfg="phone"]').forEach(function(e){e.textContent=val;});}
  if(fieldId==='cfg-horario'){document.querySelectorAll('[data-cfg="horario"]').forEach(function(e){e.textContent=val;});}
}


// ===== DISTRITO =====
function connectDistrito(){
  const email=document.getElementById('dist-email').value.trim();
  const pass=document.getElementById('dist-pass').value;
  if(!email||!pass){toast('Ingrese credenciales','error');return;}
  APP.districtConnected=true;APP.districtEmail=email;
  document.getElementById('dist-dot').className='dot dot-green';
  document.getElementById('dist-status-txt').textContent='Conectado con Distrito 10-02';
  toast('¡Conectado con Distrito 10-02!','success');
}
function disconnectDistrito(){
  APP.districtConnected=false;APP.districtEmail='';
  document.getElementById('dist-dot').className='dot dot-red';
  document.getElementById('dist-status-txt').textContent='No conectado';
  toast('Desconectado','info');
}

// ===== CONFIG =====
function saveConfig(){
  const director=(document.getElementById('cfg-director') && document.getElementById('cfg-director').value.trim());
  if(director)document.getElementById('director-name-display').textContent=director;
  // Update footer/contact info dynamically
  const phone=(document.getElementById('cfg-phone') && document.getElementById('cfg-phone').value.trim());
  const lema=(document.getElementById('cfg-lema') && document.getElementById('cfg-lema').value.trim());
  APP.config={
    name:(document.getElementById('cfg-name') && document.getElementById('cfg-name').value.trim()),
    director,phone,
    email:(document.getElementById('cfg-email') && document.getElementById('cfg-email').value.trim()),
    direccion:(document.getElementById('cfg-direccion') && document.getElementById('cfg-direccion').value.trim()),
    distrito:(document.getElementById('cfg-distrito') && document.getElementById('cfg-distrito').value.trim()),
    horario:(document.getElementById('cfg-horario') && document.getElementById('cfg-horario').value.trim()),
    anio:(document.getElementById('cfg-anio') && document.getElementById('cfg-anio').value.trim()),
    lema
  };
  logAudit('config','Configuración del centro actualizada');
  persistSave();
  toast('Configuración guardada','success');
}
function changeAdminPass(){
  const old=(document.getElementById('cfg-pass-old') && document.getElementById('cfg-pass-old').value);
  const nw=(document.getElementById('cfg-pass-new') && document.getElementById('cfg-pass-new').value);
  const confirm=(document.getElementById('cfg-pass-confirm') && document.getElementById('cfg-pass-confirm').value);
  if(!old||!nw||!confirm){toast('Complete los 3 campos','error');return;}
  if(old!==APP.accounts.admin.password){toast('Contraseña actual incorrecta','error');return;}
  if(nw!==confirm){toast('Las contraseñas no coinciden','error');return;}
  if(nw.length<6){toast('La contraseña debe tener al menos 6 caracteres','error');return;}
  APP.accounts.admin.password=nw;
  ['cfg-pass-old','cfg-pass-new','cfg-pass-confirm'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  persistSave();
  toast('✅ Contraseña actualizada','success');
}

// ===== CONTADORES =====
function updateCounters(){
  const c=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
  c('st-count',APP.students.length);c('ann-count',APP.announcements.length);c('inc-count',APP.inscripciones.length);
  c('kpi-students',APP.students.length);c('kpi-anuncios',APP.announcements.length);
  c('kpi-inscripciones',APP.inscripciones.length);c('kpi-ausencias',APP.ausencias.filter(a=>a.status==='pending').length);
}

// ===== PREVIEWS =====
function previewPhoto(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{const img=document.getElementById('photo-preview');img.src=ev.target.result;img.style.display='block';document.getElementById('photo-placeholder').style.display='none';};r.readAsDataURL(f);}
function previewAnnImg(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{const img=document.getElementById('ann-img-preview');img.src=ev.target.result;img.style.display='block';document.getElementById('ann-img-placeholder').style.display='none';};r.readAsDataURL(f);}
function previewAusDoc(e){const f=e.target.files[0];if(!f||!f.type.startsWith('image/'))return;const r=new FileReader();r.onload=ev=>{const img=document.getElementById('aus-doc-preview');img.src=ev.target.result;img.style.display='block';document.getElementById('aus-doc-placeholder').style.display='none';};r.readAsDataURL(f);}
function previewDirectorPhoto(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{const el=document.getElementById('director-photo-display');el.innerHTML=`<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;};r.readAsDataURL(f);}
function previewCsImg(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{const img=document.getElementById('cs-img-preview');img.src=ev.target.result;img.style.display='block';document.getElementById('cs-img-placeholder').style.display='none';};r.readAsDataURL(f);}

// ===== SECCIÓN DE INICIO SEGÚN ROL =====
function renderRoleHomeSection(){
  const role=(APP.currentUser && APP.currentUser.role);
  const wrap=document.getElementById('home-role-section');
  if(!wrap)return;
  if(role==='admin'){
    wrap.innerHTML=`
      <div style="background:linear-gradient(135deg,#1a2a50,#0d1f3e);padding:40px 20px;">
        <div style="max-width:1100px;margin:0 auto;">
          <h3 style="font-family:'Playfair Display',serif;color:var(--gold);font-size:22px;margin-bottom:20px;">🏫 Resumen del Centro — Vista Admin</h3>
          <div class="cards-row" style="margin-bottom:0;">
            <div class="kpi-card" style="background:rgba(255,255,255,0.07);border-left:4px solid var(--gold);"><div class="kpi-icon">🎓</div><div><div class="kpi-num" style="color:var(--gold);" id="home-kpi-st">${APP.students.length}</div><div class="kpi-label" style="color:#ccc;">Estudiantes</div></div></div>
            <div class="kpi-card" style="background:rgba(255,255,255,0.07);border-left:4px solid #4ade80;"><div class="kpi-icon">📝</div><div><div class="kpi-num" style="color:#4ade80;" id="home-kpi-ins">${APP.inscripciones.length}</div><div class="kpi-label" style="color:#ccc;">Inscripciones</div></div></div>
            <div class="kpi-card" style="background:rgba(255,255,255,0.07);border-left:4px solid #f87171;"><div class="kpi-icon">📅</div><div><div class="kpi-num" style="color:#f87171;" id="home-kpi-aus">${APP.ausencias.filter(a=>a.status==='pending').length}</div><div class="kpi-label" style="color:#ccc;">Ausencias Pend.</div></div></div>
            <div class="kpi-card" style="background:rgba(255,255,255,0.07);border-left:4px solid #60a5fa;"><div class="kpi-icon">💬</div><div><div class="kpi-num" style="color:#60a5fa;" id="home-kpi-msg">${APP.mensajes.length}</div><div class="kpi-label" style="color:#ccc;">Mensajes</div></div></div>
          </div>
          <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">
            <button class="btn btn-gold" onclick="showPage('admin')">→ Ir al Panel Admin</button>
            <button class="btn btn-outline" style="color:white;border-color:rgba(255,255,255,0.3);" onclick="openModal('modal-ann')">+ Nuevo Anuncio</button>
            <button class="btn btn-outline" style="color:white;border-color:rgba(255,255,255,0.3);" onclick="showAdminSection('dash-inscripciones')">📝 Ver Inscripciones</button>
          </div>
        </div>
      </div>`;
  } else if(role==='profesor'){
    const pending=APP.ausencias.filter(a=>a.status==='pending').length;
    const msgsNoLeidos=APP.mensajes.filter(m=>!m.leido&&m.para==='Profesor(a)').length;
    wrap.innerHTML=`
      <div style="background:linear-gradient(135deg,#0d2a1f,#0a3d2e);padding:40px 20px;">
        <div style="max-width:1100px;margin:0 auto;">
          <h3 style="font-family:'Playfair Display',serif;color:#4ade80;font-size:22px;margin-bottom:20px;">👨‍🏫 Mi Resumen — Vista Maestro</h3>
          <div class="cards-row" style="margin-bottom:0;">
            <div class="kpi-card" style="background:rgba(255,255,255,0.07);border-left:4px solid #4ade80;"><div class="kpi-icon">🎓</div><div><div class="kpi-num" style="color:#4ade80;">${APP.students.length}</div><div class="kpi-label" style="color:#ccc;">Estudiantes</div></div></div>
            <div class="kpi-card" style="background:rgba(255,255,255,0.07);border-left:4px solid var(--gold);"><div class="kpi-icon">📋</div><div><div class="kpi-num" style="color:var(--gold);">${APP.notas.length}</div><div class="kpi-label" style="color:#ccc;">Notas registradas</div></div></div>
            <div class="kpi-card" style="background:rgba(255,255,255,0.07);border-left:4px solid #f87171;"><div class="kpi-icon">📅</div><div><div class="kpi-num" style="color:#f87171;">${pending}</div><div class="kpi-label" style="color:#ccc;">Ausencias Pend.</div></div></div>
            <div class="kpi-card" style="background:rgba(255,255,255,0.07);border-left:4px solid #60a5fa;"><div class="kpi-icon">💬</div><div><div class="kpi-num" style="color:#60a5fa;">${msgsNoLeidos}</div><div class="kpi-label" style="color:#ccc;">Mensajes nuevos</div></div></div>
          </div>
          <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">
            <button class="btn btn-gold" onclick="showPage('profesor')">→ Ir a Mi Panel</button>
            <button class="btn btn-outline" style="color:white;border-color:rgba(255,255,255,0.3);" onclick="openModal('modal-nota')">+ Agregar Nota</button>
            <button class="btn btn-outline" style="color:white;border-color:rgba(255,255,255,0.3);" onclick="openMensajeModal('')">💬 Mensaje a Padre</button>
          </div>
        </div>
      </div>`;
  } else {
    wrap.innerHTML='';
  }
}

// ===== PUBLIC NAV HELPERS =====
function showLoginScreen(){
  var loginScreen=document.getElementById('login-screen');
  if(loginScreen){loginScreen.style.display='flex';window.scrollTo(0,0);}
}

function scrollToTop(){window.scrollTo({top:0,behavior:'smooth'});}

function scrollToContacto(){
  showPage('home');
  setTimeout(function(){
    var el=document.querySelector('.contacto-card');
    if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
  },200);
}

// ===== GALERÍA =====
if(!APP.galeria)APP.galeria=[];

function uploadGaleriaFotos(event){
  var files=event.target.files;
  if(!files||!files.length)return;
  var loaded=0;
  Array.from(files).forEach(function(file){
    var reader=new FileReader();
    reader.onload=function(e){
      APP.galeria.push({id:Date.now()+Math.random(),src:e.target.result,name:file.name});
      loaded++;
      if(loaded===files.length){renderGaleriaAdmin();renderGaleriaPublic();toast(loaded+' foto(s) añadida(s)','success');}
    };
    reader.readAsDataURL(file);
  });
  event.target.value='';
}

function renderGaleriaAdmin(){
  var grid=document.getElementById('galeria-admin-grid');if(!grid)return;
  if(!APP.galeria||!APP.galeria.length){grid.innerHTML='<p style="color:#888;font-size:13px;">Aún no hay fotos subidas.</p>';return;}
  grid.innerHTML=APP.galeria.map(function(f,i){
    return '<div class="galeria-admin-item">'+
      '<img src="'+f.src+'" alt="Foto '+i+'">'+
      '<button class="galeria-admin-del" onclick="deleteGaleriaFoto('+i+')">✕ Borrar</button>'+
    '</div>';
  }).join('');
}

function deleteGaleriaFoto(idx){
  APP.galeria.splice(idx,1);
  renderGaleriaAdmin();renderGaleriaPublic();
  toast('Foto eliminada','info');
}

function renderGaleriaPublic(){
  var grid=document.getElementById('galeria-grid');if(!grid)return;
  if(!APP.galeria||!APP.galeria.length){
    grid.innerHTML='<div class="galeria-placeholder">📷<br><small>El admin puede agregar fotos desde el panel</small></div>';
    return;
  }
  grid.innerHTML=APP.galeria.map(function(f,i){
    return '<div class="galeria-img" onclick="openLightbox(\''+i+'\')"><img src="'+f.src+'" alt="Foto '+i+'"></div>';
  }).join('');
}

function openLightbox(idx){
  var f=APP.galeria[idx];if(!f)return;
  var lb=document.createElement('div');
  lb.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:pointer;';
  lb.innerHTML='<img src="'+f.src+'" style="max-width:90vw;max-height:90vh;border-radius:10px;object-fit:contain;"><button style="position:absolute;top:20px;right:28px;background:none;border:none;color:white;font-size:32px;cursor:pointer;">✕</button>';
  lb.onclick=function(){lb.remove();};
  document.body.appendChild(lb);
}

// ===== ROLES MANAGEMENT =====
var currentRoleFilter='todos';

function renderRolesPanel(){
  var list=document.getElementById('roles-lista');
  if(!list)return;
  var users=[];
  // Admin principal
  users.push({name:APP.accounts.admin.name||'Administración', email:APP.accounts.admin.email, role:'admin', emoji:'⚙️', tipo:'admin_main'});
  // Admins extra
  (APP.accounts.admins||[]).forEach(function(a){
    users.push({name:a.name||a.email, email:a.email, role:'admin', emoji:'⚙️', tipo:'admin_extra', ref:a});
  });
  // Profesores
  if(APP.profesores){
    APP.profesores.forEach(function(p){users.push({name:p.nombre+' '+p.apellido,email:p.email,role:'profesor',emoji:'👨‍🏫',ref:p,tipo:'profesor'});});
  } else {
    users.push({name:'Maestro/a',email:APP.accounts&&APP.accounts.profesor?APP.accounts.profesor.email:'',role:'profesor',emoji:'👨‍🏫'});
  }
  // Estudiantes
  APP.students.forEach(function(s){users.push({name:s.nombre+' '+s.apellido,email:s.email,role:'estudiante',emoji:'🎓',ref:s,tipo:'estudiante',grado:s.grado});});
  // Padres
  APP.padres.forEach(function(p){users.push({name:p.nombre+' '+p.apellido,email:p.email,role:'padre',emoji:'👪',ref:p,tipo:'padre'});});
  // Enfermería
  var enf=APP.accounts&&APP.accounts.enfermeria;
  if(enf) users.push({name:enf.name||'Enfermería',email:enf.email,role:'enfermeria',emoji:'🏥',tipo:'enfermeria'});

  var filtered=currentRoleFilter==='todos'?users:users.filter(function(u){return u.role===currentRoleFilter;});
  if(!filtered.length){list.innerHTML='<p style="color:#888;font-size:13px;padding:20px;">No hay usuarios en esta categoría.</p>';return;}

  var roleLabels={admin:'⚙️ Admin',profesor:'👨‍🏫 Profesor',estudiante:'🎓 Estudiante',padre:'👪 Padre',enfermeria:'🏥 Enfermería'};
  var roleCss={admin:'role-badge-admin',profesor:'role-badge-profesor',estudiante:'role-badge-estudiante',padre:'role-badge-padre',enfermeria:'role-badge-admin'};
  var roleOptions=['admin','profesor','estudiante','padre','enfermeria'];

  list.innerHTML=filtered.map(function(u,i){
    var opts=roleOptions.map(function(r){
      return '<option value="'+r+'"'+(u.role===r?' selected':'')+'>'+roleLabels[r]+'</option>';
    }).join('');
    return '<div class="role-user-row">'+
      '<div class="role-user-info">'+
        '<div class="role-user-avatar">'+u.emoji+'</div>'+
        '<div>'+
          '<p style="font-weight:700;font-size:14px;margin:0;">'+u.name+'</p>'+
          '<p style="font-size:12px;color:#888;margin:0;">'+u.email+(u.grado?' · '+u.grado:'')+'</p>'+
        '</div>'+
        '<span class="role-badge-pill '+roleCss[u.role]+'">'+roleLabels[u.role]+'</span>'+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:8px;">'+
        '<select style="font-size:12px;padding:5px 8px;border-radius:6px;border:1px solid var(--border);" id="role-sel-'+i+'">'+opts+'</select>'+
        '<button class="btn btn-gold" style="padding:5px 12px;font-size:12px;" onclick="applyRoleChange('+i+',\''+u.email+'\',\''+u.role+'\')">✅ Aplicar</button>'+
        (u.role!=='admin'?'<button class="btn btn-outline" style="padding:5px 10px;font-size:12px;color:#ef4444;border-color:#ef4444;" onclick="deleteUser(\''+u.email+'\',\''+u.tipo+'\')">🗑</button>':'')+'</div>'+
    '</div>';
  }).join('');
}

function filterRoles(role){
  currentRoleFilter=role;
  renderRolesPanel();
}

function toggleRolExtra(){
  var tipo=document.getElementById('rol-tipo');
  var gradoWrap=document.getElementById('rol-grado-wrap');
  if(gradoWrap) gradoWrap.style.display=(tipo&&tipo.value==='estudiante')?'block':'none';
}

function saveRolUsuario(){
  var nombre=(document.getElementById('rol-nombre')&&document.getElementById('rol-nombre').value.trim())||'';
  var apellido=(document.getElementById('rol-apellido')&&document.getElementById('rol-apellido').value.trim())||'';
  var email=(document.getElementById('rol-email')&&document.getElementById('rol-email').value.trim().toLowerCase())||'';
  var pass=(document.getElementById('rol-pass')&&document.getElementById('rol-pass').value)||'';
  var tipo=(document.getElementById('rol-tipo')&&document.getElementById('rol-tipo').value)||'profesor';
  var grado=(document.getElementById('rol-grado')&&document.getElementById('rol-grado').value)||'';
  if(!nombre||!email||!pass)return toast('Completa nombre, correo y contraseña','error');
  if(tipo==='profesor'){
    if(!APP.profesores)APP.profesores=[];
    APP.profesores.push({nombre:nombre,apellido:apellido,email:email,pass:pass,tipo:'profesor'});
  } else if(tipo==='estudiante'){
    var id='ST'+Date.now();
    APP.students.push({id:id,nombre:nombre,apellido:apellido,email:email,pass:pass,grado:grado||'1° Primaria',esSecundaria:false,carrera:'',telPadre:'',emailPadre:'',tipo:'estudiante'});
  } else if(tipo==='padre'){
    APP.padres.push({nombre:nombre,apellido:apellido,email:email,pass:pass,hijo:'',telefono:'',tipo:'padre'});
  }
  // Clear fields
  ['rol-nombre','rol-apellido','rol-email','rol-pass'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  renderRolesPanel();
  toast('Usuario creado como '+tipo,'success');
}

function applyRoleChange(idx, email, oldRole){
  var sel = document.getElementById('role-sel-'+idx);
  if(!sel) return;
  var newRole = sel.value;
  if(newRole === oldRole) return toast('El usuario ya tiene ese rol','info');
  if(!confirm('¿Cambiar el rol de este usuario de "'+oldRole+'" a "'+newRole+'"? Deberá iniciar sesión de nuevo.')) return;

  // Find user data from old collection
  var userData = null;
  if(oldRole==='estudiante') userData = (APP.students||[]).find(function(s){ return s.email===email; });
  else if(oldRole==='padre')    userData = (APP.padres||[]).find(function(p){ return p.email===email; });
  else if(oldRole==='profesor') userData = (APP.profesores||[]).find(function(p){ return p.email===email; });

  if(!userData && oldRole!=='admin'){ toast('Usuario no encontrado','error'); return; }

  var nombre   = userData ? (userData.nombre||'') : '';
  var apellido = userData ? (userData.apellido||'') : '';
  var pass     = userData ? (userData.pass||'') : '';

  // Remove from old collection
  if(oldRole==='estudiante') APP.students   = (APP.students||[]).filter(function(s){ return s.email!==email; });
  else if(oldRole==='padre')    APP.padres   = (APP.padres||[]).filter(function(p){ return p.email!==email; });
  else if(oldRole==='profesor') APP.profesores = (APP.profesores||[]).filter(function(p){ return p.email!==email; });

  // Add to new collection
  if(newRole==='profesor'){
    if(!APP.profesores) APP.profesores=[];
    APP.profesores.push({nombre:nombre, apellido:apellido, email:email, pass:pass, tipo:'profesor'});
  } else if(newRole==='estudiante'){
    if(!APP.students) APP.students=[];
    APP.students.push({id:'ST'+Date.now(), nombre:nombre, apellido:apellido, email:email, pass:pass, grado:'1° Primaria', tipo:'estudiante'});
  } else if(newRole==='padre'){
    if(!APP.padres) APP.padres=[];
    APP.padres.push({nombre:nombre, apellido:apellido, email:email, pass:pass, hijo:'', telefono:'', tipo:'padre'});
  } else if(newRole==='admin'){
    // Agregar como admin extra en accounts
    if(!APP.accounts.admins) APP.accounts.admins = [];
    // Verificar que no exista ya
    var yaAdmin = APP.accounts.admins.find(function(a){ return a.email===email; });
    if(!yaAdmin){
      APP.accounts.admins.push({
        email: email,
        password: pass || userData.pass || '',
        role: 'admin',
        name: nombre + (apellido?' '+apellido:'')
      });
    }
  }

  persistSave();
  renderRolesPanel();
  toast('✅ Rol cambiado a '+newRole+'. El usuario debe iniciar sesión de nuevo.','success');
  logAudit('roles','Rol cambiado: '+email+' de '+oldRole+' a '+newRole);
}

function deleteUser(email,tipo){
  if(tipo==='admin_main'){toast('No se puede eliminar el admin principal.','error');return;}
  if(!confirm('¿Eliminar este usuario?'))return;
  if(tipo==='estudiante')   APP.students  = APP.students.filter(function(s){return s.email!==email;});
  else if(tipo==='padre')   APP.padres    = APP.padres.filter(function(p){return p.email!==email;});
  else if(tipo==='profesor'&&APP.profesores) APP.profesores = APP.profesores.filter(function(p){return p.email!==email;});
  else if(tipo==='admin_extra'&&APP.accounts.admins) APP.accounts.admins = APP.accounts.admins.filter(function(a){return a.email!==email;});
  else if(tipo==='enfermeria'){/* no eliminar enfermería */return;}
  persistSave();
  renderRolesPanel();
  toast('Usuario eliminado','success');
}

// ===== RICH EDITOR =====
function fmt(cmd,val){
  var editor=document.getElementById('cs-contenido');
  if(editor)editor.focus();
  document.execCommand(cmd,false,val||null);
}

function insertImgInEditor(){
  document.getElementById('cs-inline-img').click();
}

function handleInlineImg(event){
  var file=event.target.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(e){
    var editor=document.getElementById('cs-contenido');
    if(editor){
      editor.focus();
      document.execCommand('insertHTML',false,'<img src="'+e.target.result+'" style="max-width:100%;border-radius:8px;margin:8px 0;">');
    }
  };
  reader.readAsDataURL(file);
  event.target.value='';
}

function previewCustomSection(){
  var titulo=(document.getElementById('cs-titulo')&&document.getElementById('cs-titulo').value.trim())||'';
  var subtitulo=(document.getElementById('cs-subtitulo')&&document.getElementById('cs-subtitulo').value.trim())||'';
  var contenido=(document.getElementById('cs-contenido')&&document.getElementById('cs-contenido').innerHTML)||'';
  var color=(document.getElementById('cs-color-pick')&&document.getElementById('cs-color-pick').value)||'#16213E';
  var imgEl=document.getElementById('cs-img-preview');
  var img=imgEl&&imgEl.style.display!=='none'?imgEl.src:'';
  var layout=(document.getElementById('cs-layout')&&document.getElementById('cs-layout').value)||'full';
  var box=document.getElementById('cs-preview-box');
  if(!box)return;
  box.style.display='block';
  box.innerHTML=buildCustomSectionHTML({titulo,subtitulo,contenido,color,img,layout});
}

function buildCustomSectionHTML(s){
  var imgHtml=s.img?'<img src="'+s.img+'" style="max-width:100%;border-radius:10px;object-fit:cover;'+(s.layout==='full'?'width:100%;max-height:280px;':'max-height:220px;')+'">'  :'';
  var grid=s.layout==='left'?'<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:center;">'+imgHtml+'<div>'+s.contenido+'</div></div>':
            s.layout==='right'?'<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:center;"><div>'+s.contenido+'</div>'+imgHtml+'</div>':
            s.layout==='card'?'<div style="background:rgba(255,255,255,0.1);border-radius:12px;padding:20px;">'+imgHtml+(imgHtml?'<div style="margin-top:12px;">':'')+'<div>'+s.contenido+'</div>'+(imgHtml?'</div>':'')+'</div>':
            imgHtml+'<div style="margin-top:'+(s.img?'14px':'0')+';">'+s.contenido+'</div>';
  return '<div style="background:'+s.color+';padding:36px 24px;color:white;">'+
    '<div style="max-width:1000px;margin:0 auto;">'+
    (s.titulo?'<h2 style="font-family:\'Playfair Display\',serif;color:var(--gold);font-size:26px;margin:0 0 6px;">'+s.titulo+'</h2>':'')+
    (s.subtitulo?'<p style="color:rgba(255,255,255,0.75);font-size:14px;margin:0 0 18px;">'+s.subtitulo+'</p>':'')+
    grid+'</div></div>';
}


var roleThemes={admin:{},prof:{},padre:{}};

function applyRoleTheme(role){
  var bg=document.getElementById(role+'-bg-color');
  var card=document.getElementById(role+'-card-color');
  var accent=document.getElementById(role+'-accent-color');
  var font=document.getElementById(role+'-font-select');
  var wrap=document.getElementById(role+'-perfil-wrap');
  var perfCard=document.getElementById(role+'-perfil-card');
  var header=document.getElementById(role+'-perfil-header');
  if(wrap&&bg) wrap.style.background=bg.value;
  if(perfCard){
    if(card) perfCard.style.background=card.value;
  }
  if(header&&accent) header.style.borderBottom='3px solid '+accent.value;
  if(wrap&&font) wrap.style.fontFamily=font.value+',sans-serif';
  var labels=document.querySelectorAll('#'+role+'-perfil-card .perfil-label');
  labels.forEach(function(l){if(accent)l.style.color=accent.value;});
  // Also apply accent to avatar border
  var avatar=document.getElementById(role+'-perfil-avatar');
  if(avatar&&accent) avatar.style.borderColor=accent.value;
}

function resetRoleTheme(role){
  var defaults={
    admin:{bg:'#f5f0e8',card:'#ffffff',accent:'#d4af37',font:'Nunito'},
    prof:{bg:'#f5f0e8',card:'#ffffff',accent:'#4ade80',font:'Nunito'},
    padre:{bg:'#f5f0e8',card:'#ffffff',accent:'#d4af37',font:'Nunito'}
  };
  var d=defaults[role]||defaults.admin;
  var bgEl=document.getElementById(role+'-bg-color');if(bgEl)bgEl.value=d.bg;
  var cardEl=document.getElementById(role+'-card-color');if(cardEl)cardEl.value=d.card;
  var accentEl=document.getElementById(role+'-accent-color');if(accentEl)accentEl.value=d.accent;
  var fontEl=document.getElementById(role+'-font-select');if(fontEl)fontEl.value=d.font;
  applyRoleTheme(role);
  toast('Tema restablecido','info');
}

function savePadreProfile(){
  var nombre=document.getElementById('padre-edit-nombre');
  var apellido=document.getElementById('padre-edit-apellido');
  if(!nombre||!nombre.value.trim())return toast('Ingresa tu nombre','error');
  var fullName=nombre.value.trim()+(apellido&&apellido.value.trim()?' '+apellido.value.trim():'');
  if(APP.currentUser)APP.currentUser.name=fullName;
  var nameEl=document.getElementById('nav-username');if(nameEl)nameEl.textContent=fullName;
  var pNombre=document.getElementById('padre-name-display');if(pNombre)pNombre.textContent=fullName;
  var pPNombre=document.getElementById('padre-perfil-nombre');if(pPNombre)pPNombre.textContent=fullName;
  toast('Nombre actualizado','success');
}

function saveAdminProfile(){
  var nombre=document.getElementById('admin-edit-nombre');
  var apellido=document.getElementById('admin-edit-apellido');
  if(!nombre||!nombre.value.trim())return toast('Ingresa tu nombre','error');
  var fullName=nombre.value.trim()+(apellido&&apellido.value.trim()?' '+apellido.value.trim():'');
  if(APP.currentUser)APP.currentUser.name=fullName;
  var nameEl=document.getElementById('nav-username');if(nameEl)nameEl.textContent=fullName;
  var pNombre=document.getElementById('admin-perfil-nombre');if(pNombre)pNombre.textContent=fullName;
  toast('Nombre actualizado','success');
}

// ===== ESTUDIANTE EXTRA INFO & THEME =====
var estExtraData={};
var estTheme={bg:'#f5f0e8',card:'#ffffff',text:'#16213e',accent:'#d4af37',font:'Nunito'};

function saveEstExtra(){
  var studentId=APP.currentUser&&APP.currentUser.studentId;
  if(!studentId)return;
  estExtraData[studentId]={
    nacimiento:(document.getElementById('est-edit-nacimiento')&&document.getElementById('est-edit-nacimiento').value)||'',
    edad:(document.getElementById('est-edit-edad')&&document.getElementById('est-edit-edad').value)||'',
    sangre:(document.getElementById('est-edit-sangre')&&document.getElementById('est-edit-sangre').value)||'',
    nacionalidad:(document.getElementById('est-edit-nacionalidad')&&document.getElementById('est-edit-nacionalidad').value)||'',
    ciudad:(document.getElementById('est-edit-ciudad')&&document.getElementById('est-edit-ciudad').value)||'',
    medica:(document.getElementById('est-edit-medica')&&document.getElementById('est-edit-medica').value)||'',
    deporte:(document.getElementById('est-edit-deporte')&&document.getElementById('est-edit-deporte').value)||'',
    materia:(document.getElementById('est-edit-materia')&&document.getElementById('est-edit-materia').value)||'',
    bio:(document.getElementById('est-edit-bio')&&document.getElementById('est-edit-bio').value)||''
  };
  renderEstExtraInfo(studentId);
  toast('Información guardada','success');
}

function renderEstExtraInfo(studentId){
  var data=estExtraData[studentId];
  if(!data)return;
  var container=document.getElementById('est-extra-info');
  if(!container)return;
  var fields=[
    {label:'📅 Fecha de Nacimiento',val:data.nacimiento},
    {label:'🎂 Edad',val:data.edad?data.edad+' años':''},
    {label:'🩸 Tipo de Sangre',val:data.sangre},
    {label:'🌍 Nacionalidad',val:data.nacionalidad},
    {label:'📍 Ciudad',val:data.ciudad},
    {label:'🏥 Condición Médica',val:data.medica},
    {label:'⚽ Deporte / Actividad',val:data.deporte},
    {label:'📚 Materia Favorita',val:data.materia}
  ].filter(function(f){return f.val;});
  var bioEl=document.getElementById('est-bio-display');
  if(bioEl)bioEl.textContent=data.bio||'';
  container.innerHTML=fields.length?'<div style="padding:0 0 8px;border-top:1px solid var(--border);margin:0 16px;padding-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:6px;">'+
    fields.map(function(f){return '<div class="perfil-row" style="margin:0;padding:6px 0;"><span class="perfil-label" style="font-size:11px;">'+f.label+'</span><span class="perfil-value" style="font-size:13px;">'+f.val+'</span></div>';}).join('')+'</div>':'';
  // Fill edit fields back
  if(data.nacimiento){var el=document.getElementById('est-edit-nacimiento');if(el)el.value=data.nacimiento;}
  if(data.edad){var el2=document.getElementById('est-edit-edad');if(el2)el2.value=data.edad;}
  if(data.sangre){var el3=document.getElementById('est-edit-sangre');if(el3)el3.value=data.sangre;}
  if(data.nacionalidad){var el4=document.getElementById('est-edit-nacionalidad');if(el4)el4.value=data.nacionalidad;}
  if(data.ciudad){var el5=document.getElementById('est-edit-ciudad');if(el5)el5.value=data.ciudad;}
  if(data.medica){var el6=document.getElementById('est-edit-medica');if(el6)el6.value=data.medica;}
  if(data.deporte){var el7=document.getElementById('est-edit-deporte');if(el7)el7.value=data.deporte;}
  if(data.materia){var el8=document.getElementById('est-edit-materia');if(el8)el8.value=data.materia;}
  if(data.bio){var el9=document.getElementById('est-edit-bio');if(el9)el9.value=data.bio;}
}

function applyEstTheme(){
  var bg=document.getElementById('est-bg-color');
  var card=document.getElementById('est-card-color');
  var text=document.getElementById('est-text-color');
  var accent=document.getElementById('est-accent-color');
  var font=document.getElementById('est-font-select');
  var wrap=document.getElementById('est-perfil-wrap');
  var perfCard=document.getElementById('est-perfil-card');
  var header=document.getElementById('est-perfil-header');
  if(wrap&&bg) wrap.style.background=bg.value;
  if(perfCard&&card){perfCard.style.background=card.value;perfCard.style.color=text?text.value:'#16213e';}
  if(header&&accent) header.style.background='linear-gradient(135deg,'+accent.value+'22,'+accent.value+'44)';
  if(wrap&&font) wrap.style.fontFamily=font.value+',sans-serif';
  var labels=document.querySelectorAll('#est-perfil-card .perfil-label');
  labels.forEach(function(l){if(accent)l.style.color=accent.value;});
}

function resetEstTheme(){
  var fields=['est-bg-color','est-card-color','est-text-color','est-accent-color'];
  var defaults=['#f5f0e8','#ffffff','#16213e','#d4af37'];
  fields.forEach(function(id,i){var el=document.getElementById(id);if(el)el.value=defaults[i];});
  var font=document.getElementById('est-font-select');if(font)font.value='Nunito';
  applyEstTheme();
  toast('Tema restablecido','info');
}

// ===== ADMIN WEB DESIGN =====
var webDesignData={};

function previewWebDesign(){
  var navy=document.getElementById('dw-color-navy');
  var prev=document.getElementById('dw-navbar-preview');
  if(prev&&navy) prev.style.background=navy.value;
  var gold=document.getElementById('dw-color-gold');
  var prevSub=prev&&prev.querySelector('p:last-child');
  if(prevSub&&gold) prevSub.style.color=gold.value;
}

function previewHeroImg(event){
  var file=event.target.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(e){
    var prev=document.getElementById('dw-hero-img-preview');
    var ph=document.getElementById('dw-hero-img-placeholder');
    if(prev){prev.src=e.target.result;prev.style.display='block';}
    if(ph)ph.style.display='none';
    webDesignData.heroBg=e.target.result;
  };
  reader.readAsDataURL(file);
}

function previewLogoImg(event){
  var file=event.target.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(e){
    var prev=document.getElementById('dw-logo-preview');
    var ph=document.getElementById('dw-logo-placeholder');
    if(prev){prev.src=e.target.result;prev.style.display='block';}
    if(ph)ph.style.display='none';
    webDesignData.logo=e.target.result;
    // Apply to all logo images
    document.querySelectorAll('.nav-logo-img,.about-logo img,.login-emblem img').forEach(function(img){img.src=e.target.result;});
    toast('Logo actualizado','success');
  };
  reader.readAsDataURL(file);
}

function applyWebDesign(){
  var navy=(document.getElementById('dw-color-navy')&&document.getElementById('dw-color-navy').value)||'#16213e';
  var blue=(document.getElementById('dw-color-blue')&&document.getElementById('dw-color-blue').value)||'#0f3460';
  var gold=(document.getElementById('dw-color-gold')&&document.getElementById('dw-color-gold').value)||'#d4af37';
  var bg=(document.getElementById('dw-color-bg')&&document.getElementById('dw-color-bg').value)||'#f5f0e8';
  var navbar=(document.getElementById('dw-color-navbar')&&document.getElementById('dw-color-navbar').value)||'#16213e';
  var textColor=(document.getElementById('dw-color-text')&&document.getElementById('dw-color-text').value)||'#16213e';
  var fontMain=(document.getElementById('dw-font-main')&&document.getElementById('dw-font-main').value)||'Nunito';
  var heroTitle=(document.getElementById('dw-hero-title')&&document.getElementById('dw-hero-title').value)||'Centro Educativo';
  var heroSub=(document.getElementById('dw-hero-subtitle')&&document.getElementById('dw-hero-subtitle').value)||'Otilia Peláez';
  var heroDesc=(document.getElementById('dw-hero-desc')&&document.getElementById('dw-hero-desc').value)||'';

  // Apply CSS variables
  var root=document.documentElement;
  root.style.setProperty('--navy',navy);
  root.style.setProperty('--blue',blue);
  root.style.setProperty('--gold',gold);
  root.style.setProperty('--gold-dark',gold);
  root.style.setProperty('--gray',navy);
  root.style.setProperty('--bg',bg);
  document.body.style.background=bg;
  document.body.style.fontFamily=fontMain+',sans-serif';

  // Apply navbar color
  var nav=document.getElementById('navbar');
  if(nav)nav.style.background=navbar;

  // Apply hero text
  var h1=document.querySelector('#hero h1');
  if(h1)h1.innerHTML=heroTitle+'<br><span>'+heroSub+'</span>';
  var heroSubEl=document.querySelector('#hero .hero-sub');
  if(heroSubEl&&heroDesc)heroSubEl.textContent=heroDesc;

  // Apply hero bg image
  var hero=document.getElementById('hero');
  if(hero&&webDesignData.heroBg){
    hero.style.backgroundImage='linear-gradient(rgba(0,0,0,0.55),rgba(0,0,0,0.55)),url('+webDesignData.heroBg+')';
    hero.style.backgroundSize='cover';
    hero.style.backgroundPosition='center';
  }

  toast('✅ Cambios aplicados al sitio','success');
}

function resetWebDesign(){
  var root=document.documentElement;
  root.style.setProperty('--navy','#16213e');
  root.style.setProperty('--blue','#0f3460');
  root.style.setProperty('--gold','#d4af37');
  root.style.setProperty('--gold-dark','#b8962e');
  root.style.setProperty('--gray','#1a2744');
  document.body.style.background='';
  document.body.style.fontFamily='';
  var nav=document.getElementById('navbar');if(nav)nav.style.background='';
  toast('Diseño restablecido','info');
}


// ================================================================
//  📸 SISTEMA DE FOTOS DE PERFIL — guardado por correo
// ================================================================

// Obtener foto guardada para un correo
// ── Clave única por correo + rol para separar fotos ──────────────
function photoKey(email, role){
  return (email||'') + '::' + (role||'');
}

function getPhotoForEmail(email, role){
  try{
    var all = JSON.parse(localStorage.getItem('otiUserPhotos')||'{}');
    // Buscar por email+rol (nuevo sistema)
    var key = photoKey(email, role);
    if(all[key]) return all[key];
    return null;
  }catch(e){ return null; }
}

function savePhotoForEmail(email, src, role){
  try{
    var all = JSON.parse(localStorage.getItem('otiUserPhotos')||'{}');
    var key = photoKey(email, role);
    all[key] = src;
    localStorage.setItem('otiUserPhotos', JSON.stringify(all));
  }catch(e){}
}

// Aplicar foto a todos los elementos de UI del rol actual
function applyPhotoToUI(role, src){
  var ids=[];
  if(role==='admin') ids=['admin-avatar-display'];
  if(role==='prof')  ids=['prof-avatar-display','prof-perfil-avatar'];
  if(role==='est')   ids=['est-avatar-display','est-perfil-avatar'];
  if(role==='padre') ids=['padre-avatar-display','padre-perfil-avatar'];
  if(role==='enfer') ids=['enfer-avatar-display','enfer-perfil-avatar'];
  ids.forEach(function(id){
    var el=document.getElementById(id);
    if(el) el.innerHTML='<img src="'+src+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
  });
  // Navbar photo
  var navPhoto=document.getElementById('nav-user-photo');
  if(navPhoto){
    navPhoto.src=src;
    navPhoto.style.display='inline-block';
  }
}

// Restaurar foto del usuario que acaba de iniciar sesión
function restoreProfilePhotos(){
  try{
    if(!APP.currentUser) return;
    var email = APP.currentUser.email;
    if(!email) return;
    var roleMap={admin:'admin',profesor:'prof',estudiante:'est',padre:'padre',enfermeria:'enfer'};
    var role = roleMap[APP.currentUser.role] || APP.currentUser.role;
    var key = photoKey(email, role);

    // 1. localStorage — clave email+rol única
    var localSrc = getPhotoForEmail(email, role);

    // 2. APP.profilePhotos (Firebase) — también por clave
    var appSrc = APP.profilePhotos && APP.profilePhotos[key];

    // Aplicar la más reciente disponible
    var bestSrc = appSrc || localSrc;
    if(bestSrc){
      applyPhotoToUI(role, bestSrc);
      // Sincronizar localStorage si Firebase tiene algo más nuevo
      if(appSrc && appSrc !== localSrc) savePhotoForEmail(email, appSrc, role);
    }

    // 3. Buscar en Firebase cloud por email+rol
    if(_firebaseReady && _db){
      var docId = (email+'__'+role).replace(/[@.]/g,'_');
      _db.collection('otilia_fotos').doc(docId).get()
        .then(function(doc){
          if(doc.exists && doc.data().foto){
            var cloudSrc = doc.data().foto;
            if(cloudSrc !== bestSrc){
              savePhotoForEmail(email, cloudSrc, role);
              if(!APP.profilePhotos) APP.profilePhotos={};
              APP.profilePhotos[key] = cloudSrc;
              applyPhotoToUI(role, cloudSrc);
            }
          }
        }).catch(function(){});
    }
  }catch(e){}
}

// Cambiar foto de perfil — guardado en Firebase + localStorage
function changeProfilePhoto(event, role){
  var file = event.target.files[0];
  if(!file) return;
  // Comprimir imagen antes de guardar (max 200px, calidad 0.7)
  var img = new Image();
  var url = URL.createObjectURL(file);
  img.onload = function(){
    var canvas = document.createElement('canvas');
    var MAX = 200;
    var ratio = Math.min(MAX/img.width, MAX/img.height);
    canvas.width  = Math.round(img.width  * ratio);
    canvas.height = Math.round(img.height * ratio);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    var src = canvas.toDataURL('image/jpeg', 0.75);
    URL.revokeObjectURL(url);
    var email = APP.currentUser && APP.currentUser.email;
    if(!email){ toast('No hay sesión activa','error'); return; }
    // Rol real del usuario actual
    var userRoleMap={admin:'admin',profesor:'prof',estudiante:'est',padre:'padre',enfermeria:'enfer'};
    var userRole = userRoleMap[APP.currentUser.role] || role;
    // 1. localStorage por email+rol (separado por usuario Y rol)
    savePhotoForEmail(email, src, userRole);
    // 2. Firebase — doc único por email+rol
    if(_firebaseReady && _db){
      var docId = (email+'__'+userRole).replace(/[@.]/g,'_');
      _db.collection('otilia_fotos').doc(docId).set({
        email: email, role: userRole, foto: src, updatedAt: Date.now()
      }).then(function(){
        toast('✅ Foto guardada en la nube','success');
      }).catch(function(){ toast('Foto guardada localmente','info'); });
    } else {
      toast('✅ Foto guardada','success');
    }
    // 3. APP data
    if(!APP.profilePhotos) APP.profilePhotos = {};
    APP.profilePhotos[email] = src;
    applyPhotoToUI(role, src);
  };
  img.src = url;
}

// Compat — no usado pero evita errores si algo lo llama
var profilePhotos = {};
function loadSavedPhotos(){}

function goToMyProfile(){
  if(!APP.currentUser)return;
  var role=APP.currentUser.role;
  if(role==='admin'){showPage('admin');showDashSection('dash-config',null);}
  else if(role==='profesor'){showPage('profesor');showProfeSection('profe-perfil',null);}
  else if(role==='estudiante'){showPage('estudiante');showEstudianteSection('est-perfil');}
  else if(role==='padre'){showPage('padre');showPadreSection('padre-perfil');}
}

// ===== PASSWORD CHANGE (estudiante, padre, profesor) =====
function changeEstPass(){
  var nw=document.getElementById('est-pass-new');
  var cf=document.getElementById('est-pass-confirm');
  if(!nw||!cf||!nw.value)return toast('Ingresa una contraseña','error');
  if(nw.value!==cf.value)return toast('Las contraseñas no coinciden','error');
  if(!APP.currentUser)return;
  var st=APP.students.find(function(s){return s.id===APP.currentUser.studentId;});
  if(st){st.pass=nw.value;nw.value='';cf.value='';toast('Contraseña cambiada','success');}
}

function changePadrePass(){
  var nw=document.getElementById('padre-pass-new');
  var cf=document.getElementById('padre-pass-confirm');
  if(!nw||!cf||!nw.value)return toast('Ingresa una contraseña','error');
  if(nw.value!==cf.value)return toast('Las contraseñas no coinciden','error');
  if(!APP.currentUser)return;
  var p=APP.padres.find(function(x){return x.email===APP.currentUser.email;});
  if(p){p.pass=nw.value;nw.value='';cf.value='';toast('Contraseña cambiada','success');}
}

function changeProfPass(){
  var nw=document.getElementById('prof-pass-new');
  var cf=document.getElementById('prof-pass-confirm');
  if(!nw||!cf||!nw.value)return toast('Ingresa una contraseña','error');
  if(nw.value!==cf.value)return toast('Las contraseñas no coinciden','error');
  if(!APP.currentUser)return;
  var prof=APP.profesores&&APP.profesores.find(function(p){return p.email===APP.currentUser.email;});
  if(prof){prof.pass=nw.value;}
  else{APP.accounts.profesor.password=nw.value;}
  nw.value='';cf.value='';toast('Contraseña cambiada','success');
}

function saveProfeProfile(){
  var nombre=document.getElementById('prof-edit-nombre');
  var apellido=document.getElementById('prof-edit-apellido');
  if(!nombre||!nombre.value.trim())return toast('Ingresa tu nombre','error');
  var fullName=nombre.value.trim()+(apellido&&apellido.value.trim()?' '+apellido.value.trim():'');
  if(APP.currentUser)APP.currentUser.name=fullName;
  var nameEl=document.getElementById('nav-username');if(nameEl)nameEl.textContent=fullName;
  var profNEl=document.getElementById('prof-name-display');if(profNEl)profNEl.textContent=fullName;
  var profPEl=document.getElementById('prof-perfil-nombre');if(profPEl)profPEl.textContent=fullName;
  toast('Perfil actualizado','success');
}

// Fill padre perfil data
function fillPadrePerfil(user){
  if(!user)return;
  var padre=APP.padres.find(function(p){return p.email===user.email;});
  var fullName=user.name||(padre?(padre.nombre+' '+padre.apellido):'—');
  // Banner
  var nameEl=document.getElementById('padre-name-display');if(nameEl)nameEl.textContent=fullName;
  // Perfil card
  var pNombre=document.getElementById('padre-perfil-nombre');if(pNombre)pNombre.textContent=fullName;
  var pEmail=document.getElementById('padre-perfil-email');if(pEmail)pEmail.textContent=user.email||'—';
  var pHijo=document.getElementById('padre-perfil-hijo');if(pHijo)pHijo.textContent=(padre&&padre.hijo)||user.child||'—';
  var pTel=document.getElementById('padre-perfil-tel');if(pTel)pTel.textContent=(padre&&padre.telefono)||user.telefono||'—';
  // Edit fields
  var parts=fullName.split(' ');
  var editN=document.getElementById('padre-edit-nombre');if(editN)editN.value=parts[0]||'';
  var editA=document.getElementById('padre-edit-apellido');if(editA)editA.value=parts.slice(1).join(' ')||'';
}

function fillAdminPerfil(user){
  if(!user)return;
  var fullName=user.name||'Administrador';
  var pNombre=document.getElementById('admin-perfil-nombre');if(pNombre)pNombre.textContent=fullName;
  var parts=fullName.split(' ');
  var editN=document.getElementById('admin-edit-nombre');if(editN)editN.value=parts[0]||'';
  var editA=document.getElementById('admin-edit-apellido');if(editA)editA.value=parts.slice(1).join(' ')||'';
}

// Fill profesor perfil data
function fillProfPerfil(user){
  if(!user)return;
  var fullName=user.name||'Profesor/a';
  var pNombre=document.getElementById('prof-perfil-nombre');if(pNombre)pNombre.textContent=fullName;
  var pEmail=document.getElementById('prof-perfil-email');if(pEmail)pEmail.textContent=user.email||'—';
  var profNameDisplay=document.getElementById('prof-name-display');if(profNameDisplay)profNameDisplay.textContent=fullName;
  var parts=fullName.split(' ');
  var editNombre=document.getElementById('prof-edit-nombre');if(editNombre)editNombre.value=parts[0]||'';
  var editApellido=document.getElementById('prof-edit-apellido');if(editApellido)editApellido.value=parts.slice(1).join(' ')||'';
}


function toast(msg,type='info'){
  const c=document.getElementById('toast-container');
  const t=document.createElement('div');t.className=`toast toast-${type}`;t.textContent=msg;c.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(100%)';t.style.transition='all 0.3s';setTimeout(()=>t.remove(),300);},3500);
}

// ===== AUDIT LOG =====
if(!APP.auditLog)APP.auditLog=[];

function logAudit(tipo,mensaje,usuario){
  if(!APP.auditLog)APP.auditLog=[];
  APP.auditLog.unshift({
    id:Date.now(),
    tipo:tipo,
    mensaje:mensaje,
    usuario:usuario||(APP.currentUser&&APP.currentUser.name)||'Sistema',
    email:APP.currentUser&&APP.currentUser.email||'—',
    rol:APP.currentUser&&APP.currentUser.role||'sistema',
    fecha:new Date().toLocaleDateString('es-DO'),
    hora:new Date().toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'})
  });
  if(APP.auditLog.length>500)APP.auditLog=APP.auditLog.slice(0,500);
}

function renderAuditLog(){
  var lista=document.getElementById('audit-log-list');
  var stats=document.getElementById('audit-stats');
  if(!lista)return;
  var filter=(document.getElementById('audit-filter')&&document.getElementById('audit-filter').value)||'todos';
  var logs=filter==='todos'?APP.auditLog:APP.auditLog.filter(function(l){return l.tipo===filter;});

  // Stats cards
  var tipos={login:'🔐',anuncio:'📢',nota:'📋',inscripcion:'📝',config:'⚙️',usuario:'👤',archivo:'🗂',sistema:'🔧'};
  var conteos={};
  APP.auditLog.forEach(function(l){conteos[l.tipo]=(conteos[l.tipo]||0)+1;});
  if(stats){
    stats.innerHTML='<div class="kpi-card" style="padding:10px 14px;"><div class="kpi-num" style="font-size:20px;">'+APP.auditLog.length+'</div><div class="kpi-label">Total eventos</div></div>'+
    Object.keys(conteos).map(function(k){return '<div class="kpi-card" style="padding:10px 14px;border-left-color:var(--gold);"><div class="kpi-num" style="font-size:18px;">'+(tipos[k]||'•')+' '+conteos[k]+'</div><div class="kpi-label">'+k+'</div></div>';}).join('');
  }

  if(!logs.length){lista.innerHTML='<p style="color:#888;text-align:center;padding:30px;">No hay eventos registrados aún.</p>';return;}

  var colorMap={login:'#dbeafe',anuncio:'#fef9c3',nota:'#dcfce7',inscripcion:'#ede9fe',config:'#fee2e2',usuario:'#ffedd5',archivo:'#f0fdf4'};
  lista.innerHTML=logs.map(function(l){
    var bg=colorMap[l.tipo]||'#f8fafc';
    return '<div style="display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start;padding:10px 14px;border-bottom:1px solid var(--border);background:'+bg+';border-radius:0;">'+
      '<span style="font-size:18px;">'+(tipos[l.tipo]||'•')+'</span>'+
      '<div><p style="margin:0;font-size:13px;font-weight:600;">'+l.mensaje+'</p><p style="margin:2px 0 0;font-size:11px;color:#777;">'+l.usuario+' · '+l.email+' · '+l.rol+'</p></div>'+
      '<div style="text-align:right;white-space:nowrap;"><p style="margin:0;font-size:11px;color:#888;">'+l.fecha+'</p><p style="margin:0;font-size:11px;color:#888;">'+l.hora+'</p></div>'+
    '</div>';
  }).join('');
}

function clearAuditLog(){
  if(!confirm('¿Borrar todo el historial de auditoría?'))return;
  APP.auditLog=[];renderAuditLog();
  toast('Auditoría limpiada','info');
}

function exportAuditLog(){
  var txt=APP.auditLog.map(function(l){return l.fecha+' '+l.hora+' | '+l.tipo.toUpperCase()+' | '+l.mensaje+' | '+l.usuario+' ('+l.email+')';}).join('\n');
  var blob=new Blob([txt],{type:'text/plain'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='auditoria_otilia_pelaez.txt';a.click();
}

// ===== CONSOLA =====
function renderConsola(){
  var stats=document.getElementById('consola-stats');
  if(stats){
    var sesiones=(APP.sesiones&&APP.sesiones.length)||0;
    stats.innerHTML=[
      {n:APP.students.length,l:'🎓 Estudiantes',c:'var(--blue)'},
      {n:APP.padres.length,l:'👪 Padres',c:'var(--gold)'},
      {n:(APP.profesores&&APP.profesores.length)||0,l:'👨‍🏫 Profesores',c:'var(--success)'},
      {n:APP.inscripciones.length,l:'📝 Inscripciones',c:'var(--info)'},
      {n:APP.notas.length,l:'📋 Notas',c:'var(--navy)'},
      {n:sesiones,l:'🔐 Sesiones',c:'#7c3aed'},
      {n:APP.announcements.length,l:'📢 Anuncios',c:'#dc2626'},
      {n:(APP.auditLog&&APP.auditLog.length)||0,l:'🔍 Eventos auditoría',c:'#374151'},
    ].map(function(s){return '<div class="kpi-card" style="padding:12px 16px;border-left-color:'+s.c+';"><div class="kpi-num" style="font-size:22px;color:'+s.c+';">'+s.n+'</div><div class="kpi-label">'+s.l+'</div></div>';}).join('');
  }
  showConsolaTab('estudiantes',document.querySelector('#consola-tabs .cfg-tab'));
}

function showConsolaTab(tabla,btn){
  document.querySelectorAll('#consola-tabs .cfg-tab').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');
  var wrap=document.getElementById('consola-table-wrap');if(!wrap)return;
  var data,cols;
  if(tabla==='estudiantes'){data=APP.students;cols=['nombre','apellido','email','grado','carrera'];}
  else if(tabla==='padres'){data=APP.padres;cols=['nombre','apellido','email','hijo','telefono'];}
  else if(tabla==='profesores'){data=APP.profesores||[];cols=['nombre','apellido','email'];}
  else if(tabla==='inscripciones'){data=APP.inscripciones;cols=['nombre','apellido','grado','tutor','fecha'];}
  else if(tabla==='notas'){data=APP.notas;cols=['studentId','materia','nota','periodo','anio'];}
  else if(tabla==='sesiones'){data=APP.sesiones||[];cols=['usuario','email','rol','fecha','hora'];}
  else{data=[];cols=[];}
  if(!data||!data.length){wrap.innerHTML='<p style="color:#888;padding:20px;text-align:center;">No hay datos en esta tabla.</p>';return;}
  wrap.innerHTML='<table class="data-table" style="min-width:600px;"><thead><tr>'+cols.map(function(c){return '<th>'+c+'</th>';}).join('')+'<th>Acciones</th></tr></thead><tbody>'+
    data.map(function(row,i){return '<tr>'+cols.map(function(c){return '<td style="font-size:12px;">'+(row[c]||'—')+'</td>';}).join('')+'<td><button style="font-size:11px;padding:3px 8px;background:none;border:1px solid #ef4444;color:#ef4444;border-radius:4px;cursor:pointer;" onclick="deleteConsolaRow(\''+tabla+'\','+i+')">🗑</button></td></tr>';}).join('')+
  '</tbody></table>';
}

function deleteConsolaRow(tabla,idx){
  if(!confirm('¿Eliminar este registro?'))return;
  if(tabla==='estudiantes')APP.students.splice(idx,1);
  else if(tabla==='padres')APP.padres.splice(idx,1);
  else if(tabla==='profesores'&&APP.profesores)APP.profesores.splice(idx,1);
  else if(tabla==='inscripciones')APP.inscripciones.splice(idx,1);
  else if(tabla==='notas')APP.notas.splice(idx,1);
  logAudit('usuario','Registro eliminado de tabla: '+tabla,APP.currentUser&&APP.currentUser.name);
  renderConsola();updateCounters();
  toast('Registro eliminado','success');
}

function exportarDatos(){
  var datos={estudiantes:APP.students,padres:APP.padres,profesores:APP.profesores,inscripciones:APP.inscripciones,notas:APP.notas,anuncios:APP.announcements,auditLog:APP.auditLog,sesiones:APP.sesiones,config:APP.config,fecha:new Date().toISOString()};
  var blob=new Blob([JSON.stringify(datos,null,2)],{type:'application/json'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='datos_otilia_pelaez_'+new Date().toISOString().slice(0,10)+'.json';a.click();
  logAudit('archivo','Datos exportados en JSON',APP.currentUser&&APP.currentUser.name);
  toast('Datos exportados','success');
}

function importarDatos(event){
  var file=event.target.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var datos=JSON.parse(e.target.result);
      if(datos.estudiantes)APP.students=datos.estudiantes;
      if(datos.padres)APP.padres=datos.padres;
      if(datos.profesores)APP.profesores=datos.profesores;
      if(datos.inscripciones)APP.inscripciones=datos.inscripciones;
      if(datos.notas)APP.notas=datos.notas;
      if(datos.anuncios)APP.announcements=datos.anuncios;
      logAudit('archivo','Datos importados desde JSON',APP.currentUser&&APP.currentUser.name);
      renderConsola();updateCounters();renderAdminData();
      toast('Datos importados correctamente','success');
    }catch(err){toast('Archivo JSON inválido','error');}
  };
  reader.readAsText(file);
  event.target.value='';
}

// ===== SESSION PERSISTENCE =====
if(!APP.sesiones)APP.sesiones=[];

function saveSession(user){
  var sessions=JSON.parse(localStorage.getItem('otiSessions')||'{}');
  sessions[user.email]={email:user.email,name:user.name,role:user.role,pass:user.pass,savedAt:Date.now()};
  localStorage.setItem('otiSessions',JSON.stringify(sessions));
}

function loadRememberedAccounts(){
  try{
    var sessions=JSON.parse(localStorage.getItem('otiSessions')||'{}');
    var keys=Object.keys(sessions);if(!keys.length)return;
    var bar=document.getElementById('saved-accounts-bar');if(!bar)return;
    bar.style.display='block';
    bar.innerHTML='<p style="font-size:11px;color:rgba(255,255,255,0.6);margin:0 0 6px;">Cuentas guardadas:</p>'+
      keys.map(function(k){
        var s=sessions[k];
        var roleEmoji={admin:'⚙️',profesor:'👨‍🏫',estudiante:'🎓',padre:'👪'}[s.role]||'👤';
        return '<button onclick="quickLogin(\''+k+'\')" style="display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:10px;padding:8px 12px;cursor:pointer;margin-bottom:6px;color:white;font-family:\'Nunito\',sans-serif;font-size:13px;">'+
          '<span style="font-size:18px;">'+roleEmoji+'</span>'+
          '<div><strong>'+s.name+'</strong><br><small style="opacity:0.7;">'+s.email+'</small></div>'+
          '<span style="margin-left:auto;background:var(--gold);color:var(--navy);border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;">Entrar →</span>'+
        '</button>';
      }).join('')+
      '<button onclick="clearSavedAccounts()" style="background:none;border:none;color:rgba(255,255,255,0.5);font-size:11px;cursor:pointer;text-decoration:underline;margin-top:2px;">Limpiar cuentas guardadas</button>';
  }catch(e){}
}

function quickLogin(email){
  try{
    var sessions=JSON.parse(localStorage.getItem('otiSessions')||'{}');
    var s=sessions[email];if(!s)return;
    // Fill login form
    var emailEl=document.getElementById('login-email');
    if(emailEl){emailEl.value=s.email;emailEl.dispatchEvent(new Event('input'));}
    // Auto-login
    doLoginWith(s.email,s.pass||'');
  }catch(e){toast('No se pudo iniciar sesión automáticamente','error');}
}

function clearSavedAccounts(){
  localStorage.removeItem('otiSessions');
  var bar=document.getElementById('saved-accounts-bar');if(bar)bar.style.display='none';
  toast('Cuentas guardadas eliminadas','info');
}

function togglePassVis(inputId,btn){
  var input=document.getElementById(inputId);if(!input)return;
  if(input.type==='password'){input.type='text';btn.textContent='🙈';}
  else{input.type='password';btn.textContent='👁';}
}

// ===== REMEMBER ME integration into doLogin =====
var _originalDoLogin=null;
function doLoginWith(email,pass){
  var emailEl=document.getElementById('login-email');
  var passEl=document.getElementById('login-password');
  if(emailEl)emailEl.value=email;
  if(passEl)passEl.value=pass||'';
  doLogin();
}

// ===== AUTO-SAVE ON CLOSE (sin advertencia) =====
window.addEventListener('beforeunload',function(){
  // Guardar todo silenciosamente antes de cerrar
  try{ persistSave(); }catch(e){}
  try{
    // Guardar sesión activa para restaurar al volver
    if(APP.currentUser){
      localStorage.setItem('otiActiveSession', JSON.stringify({
        user: APP.currentUser,
        savedAt: Date.now()
      }));
    }
  }catch(e){}
});

// ===== TAREAS ESTUDIANTE =====
if(!APP.tareas)APP.tareas=[];

function addTarea(){
  var txt=(document.getElementById('tarea-nueva')&&document.getElementById('tarea-nueva').value.trim())||'';
  var fecha=(document.getElementById('tarea-fecha')&&document.getElementById('tarea-fecha').value)||'';
  var materia=(document.getElementById('tarea-materia')&&document.getElementById('tarea-materia').value)||'';
  if(!txt)return toast('Escribe una tarea','error');
  if(!APP.tareas)APP.tareas=[];
  APP.tareas.push({id:Date.now(),txt,fecha,materia,done:false,userId:APP.currentUser&&APP.currentUser.email});
  var el=document.getElementById('tarea-nueva');if(el)el.value='';
  renderTareas();
}

function renderTareas(){
  var lista=document.getElementById('tareas-list');if(!lista)return;
  var mis=(APP.tareas||[]).filter(function(t){return t.userId===(APP.currentUser&&APP.currentUser.email);});
  if(!mis.length){lista.innerHTML='<p style="color:#888;font-size:13px;text-align:center;padding:20px;">No tienes tareas pendientes 🎉</p>';return;}
  lista.innerHTML=mis.map(function(t){
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:'+(t.done?'#f0fdf4':'white')+';text-decoration:'+(t.done?'line-through':'none')+';color:'+(t.done?'#aaa':'inherit')+';transition:all .2s;">'+
      '<input type="checkbox" '+(t.done?'checked':'')+' onchange="toggleTarea('+t.id+')" style="width:16px;height:16px;accent-color:var(--success);cursor:pointer;">'+
      '<div style="flex:1;"><p style="margin:0;font-size:14px;font-weight:600;">'+t.txt+'</p><small style="color:#888;">'+(t.materia||'')+(t.fecha?' · Entrega: '+t.fecha:'')+'</small></div>'+
      '<button onclick="deleteTarea('+t.id+')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:16px;">🗑</button>'+
    '</div>';
  }).join('');
}

function toggleTarea(id){
  var t=(APP.tareas||[]).find(function(t){return t.id===id;});
  if(t)t.done=!t.done;
  renderTareas();
}
function deleteTarea(id){
  APP.tareas=(APP.tareas||[]).filter(function(t){return t.id!==id;});
  renderTareas();
}

// ===== ANUNCIOS EN PORTALES =====
function renderAnunciosPortal(containerId){
  var el=document.getElementById(containerId);if(!el)return;
  if(!APP.announcements||!APP.announcements.length){el.innerHTML='<p style="color:#888;grid-column:1/-1;text-align:center;padding:30px;">No hay anuncios aún.</p>';return;}
  var tipos={aviso:{c:'#dbeafe',e:'🔔'},evento:{c:'#fef9c3',e:'📅'},urgente:{c:'#fee2e2',e:'🚨'},info:{c:'#dcfce7',e:'ℹ️'}};
  el.innerHTML=APP.announcements.slice(0,6).map(function(a){
    var t=tipos[a.tipo]||{c:'#f8fafc',e:'📢'};
    return '<div style="background:'+t.c+';border-radius:14px;padding:18px;border:1px solid rgba(0,0,0,0.07);">'+
      '<p style="font-size:11px;font-weight:800;text-transform:uppercase;color:#555;margin-bottom:6px;">'+t.e+' '+a.tipo+'</p>'+
      '<h4 style="font-size:15px;color:var(--navy);margin:0 0 6px;">'+a.titulo+'</h4>'+
      '<p style="font-size:13px;color:#555;line-height:1.5;margin:0 0 8px;">'+a.desc+'</p>'+
      '<small style="color:#aaa;">'+a.fecha+(a.autor?' · '+a.autor:'')+'</small>'+
    '</div>';
  }).join('');
}

// ===== LOGROS =====
function checkLogros(){
  if(!APP.currentUser||APP.currentUser.role!=='estudiante')return;
  var el=document.getElementById('est-logros-list');if(!el)return;
  var notas=(APP.notas||[]).filter(function(n){return n.studentId===APP.currentUser.studentId;});
  var avg=notas.length?notas.reduce(function(s,n){return s+Number(n.nota);},0)/notas.length:0;
  var tiene100=notas.some(function(n){return Number(n.nota)===100;});
  var logros=[
    {icon:'🥇',titulo:'Honor Roll',desc:'Promedio ≥ 90',unlock:avg>=90},
    {icon:'💯',titulo:'Nota Perfecta',desc:'100 en cualquier materia',unlock:tiene100},
    {icon:'📚',titulo:'Lector Estrella',desc:'Completa 5 libros',unlock:false},
    {icon:'⚽',titulo:'Deportista',desc:'Participa en deporte',unlock:false},
    {icon:'🎨',titulo:'Artista',desc:'Destaca en Arte',unlock:false},
    {icon:'🤝',titulo:'Colaborador',desc:'Voluntario activo',unlock:false},
  ];
  el.innerHTML=logros.map(function(l){
    return '<div class="logro-card '+(l.unlock?'logro-ganado':'logro-bloqueado')+'">'+
      '<div class="logro-icon">'+l.icon+'</div>'+
      '<h5>'+l.titulo+'</h5>'+
      '<small>'+l.desc+'</small>'+
      (l.unlock?'<div class="logro-badge">✅ Logrado</div>':'<div class="logro-badge" style="opacity:0.4;">🔒 Bloqueado</div>')+
    '</div>';
  }).join('');
}

// ===== HORARIO SYSTEM =====
var HORARIO_DEFAULT=[
  {hora:'7:30–8:15',  lu:'Matemáticas',   ma:'Lengua Española',ma2:'Ciencias',     ju:'Matemáticas',  vi:'Historia',      receso:false},
  {hora:'8:15–9:00',  lu:'Lengua',        ma:'Inglés',          ma2:'Matemáticas',  ju:'Lengua',       vi:'Ed. Física',    receso:false},
  {hora:'9:00–9:45',  lu:'Ciencias',      ma:'Historia',        ma2:'Inglés',       ju:'Ciencias',     vi:'Informática',   receso:false},
  {hora:'RECESO',     lu:'',              ma:'',                ma2:'',             ju:'',             vi:'',              receso:true,  label:'☕ Recreo 9:45–10:00'},
  {hora:'10:00–10:45',lu:'Historia',      ma:'Ciencias',        ma2:'Lengua',       ju:'Inglés',       vi:'Matemáticas',   receso:false},
  {hora:'10:45–11:30',lu:'Ed. Física',    ma:'Arte',            ma2:'Historia',     ju:'Formación Int.',vi:'Lengua',       receso:false},
  {hora:'11:30–12:15',lu:'Informática',   ma:'Matemáticas',     ma2:'Arte',         ju:'Ed. Física',   vi:'Ciencias',      receso:false},
];

// APP.horarios = { general: [...filas], "1° Primaria": [...], ... }
if(!APP.horarios)APP.horarios={};

function getHorario(grado){
  var g=grado||'general';
  if(APP.horarios[g]&&APP.horarios[g].length)return JSON.parse(JSON.stringify(APP.horarios[g]));
  return JSON.parse(JSON.stringify(HORARIO_DEFAULT));
}

// Build HTML table from horario data
function buildHorarioHTML(filas){
  var thead='<thead><tr style="background:var(--navy);color:white;"><th style="padding:10px;font-size:13px;">Hora</th><th style="padding:10px;font-size:13px;">Lunes</th><th style="padding:10px;font-size:13px;">Martes</th><th style="padding:10px;font-size:13px;">Miércoles</th><th style="padding:10px;font-size:13px;">Jueves</th><th style="padding:10px;font-size:13px;">Viernes</th></tr></thead>';
  var tbody='<tbody>'+filas.map(function(f){
    if(f.receso)return '<tr><td colspan="6" style="text-align:center;background:#fef9c3;font-size:12px;color:#92400e;padding:7px;font-weight:700;">'+(f.label||'☕ Recreo')+'</td></tr>';
    return '<tr><td style="font-weight:700;color:var(--navy);padding:8px 10px;font-size:13px;">'+f.hora+'</td>'+
      ['lu','ma','ma2','ju','vi'].map(function(d){return '<td style="padding:8px 10px;font-size:13px;">'+(f[d]||'—')+'</td>';}).join('')+'</tr>';
  }).join('')+'</tbody>';
  return thead+tbody;
}

// Render horario into a table element
function renderHorario(tableId,grado){
  var el=document.getElementById(tableId);if(!el)return;
  // Find student's grade if role=estudiante
  var g=grado;
  if(!g&&APP.currentUser){
    if(APP.currentUser.role==='estudiante'){
      var st=(APP.students||[]).find(function(s){return s.id===APP.currentUser.studentId;});
      g=st&&st.grado||'general';
      // Show grade tag
      var tag=document.getElementById(tableId==='est-horario-table'?'est-horario-grado-tag':'padre-horario-grado-tag');
      if(tag)tag.textContent=g;
    }else if(APP.currentUser.role==='padre'){
      var pd=APP.padres.find(function(p){return p.email===APP.currentUser.email;});
      if(pd&&pd.hijo){
        var hijo=(APP.students||[]).find(function(s){return (s.nombre+' '+s.apellido).toLowerCase()===pd.hijo.toLowerCase();});
        g=hijo&&hijo.grado||'general';
      }
      var tag2=document.getElementById('padre-horario-grado-tag');
      if(tag2)tag2.textContent=g||'general';
    }
  }
  el.innerHTML=buildHorarioHTML(getHorario(g||'general'));
}

// ===== HORARIO EDITOR (admin) =====
function loadHorarioGrado(grado){
  APP._editingHorario=grado;
  var filas=getHorario(grado);
  renderHorarioEditor(filas);
  renderHorarioPreview(filas);
}

function renderHorarioEditor(filas){
  var tbody=document.getElementById('horario-edit-body');if(!tbody)return;
  tbody.innerHTML=filas.map(function(f,i){
    if(f.receso){
      return '<tr style="background:#fef9c3;" data-idx="'+i+'" data-receso="1">'+
        '<td colspan="6" style="padding:6px 10px;"><input type="text" value="'+(f.label||'☕ Recreo')+'\" style="width:100%;border:1px solid #d97706;border-radius:6px;padding:4px 8px;font-size:12px;background:#fef9c3;" oninput="updateHorarioCell('+i+',\'label\',this.value)"></td>'+
        '<td style="padding:6px;"><button onclick="deleteHorarioFila('+i+')" style="background:none;border:none;color:#ef4444;font-size:16px;cursor:pointer;">🗑</button></td>'+
      '</tr>';
    }
    return '<tr data-idx="'+i+'">'+
      '<td style="padding:4px;"><input type="text" value="'+f.hora+'" style="width:90px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;" oninput="updateHorarioCell('+i+',\'hora\',this.value)"></td>'+
      ['lu','ma','ma2','ju','vi'].map(function(d){
        return '<td style="padding:4px;"><input type="text" value="'+(f[d]||'')+'" style="width:100%;min-width:100px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;" oninput="updateHorarioCell('+i+',\''+d+'\',this.value)"></td>';
      }).join('')+
      '<td style="padding:4px;"><button onclick="deleteHorarioFila('+i+')" style="background:none;border:none;color:#ef4444;font-size:16px;cursor:pointer;">🗑</button></td>'+
    '</tr>';
  }).join('');
}

function renderHorarioPreview(filas){
  var el=document.getElementById('horario-preview-table');if(!el)return;
  el.innerHTML=buildHorarioHTML(filas);
}

// We store current editing state in APP._horarioEdit
function updateHorarioCell(idx,field,val){
  if(!APP._horarioEdit)APP._horarioEdit=getHorario(APP._editingHorario||'general');
  APP._horarioEdit[idx][field]=val;
  renderHorarioPreview(APP._horarioEdit);
}

function deleteHorarioFila(idx){
  if(!APP._horarioEdit)APP._horarioEdit=getHorario(APP._editingHorario||'general');
  APP._horarioEdit.splice(idx,1);
  renderHorarioEditor(APP._horarioEdit);
  renderHorarioPreview(APP._horarioEdit);
}

function addHorarioFila(){
  if(!APP._horarioEdit)APP._horarioEdit=getHorario(APP._editingHorario||'general');
  APP._horarioEdit.push({hora:'00:00–00:00',lu:'',ma:'',ma2:'',ju:'',vi:'',receso:false});
  renderHorarioEditor(APP._horarioEdit);
}

function addHorarioReceso(){
  if(!APP._horarioEdit)APP._horarioEdit=getHorario(APP._editingHorario||'general');
  APP._horarioEdit.push({hora:'RECESO',lu:'',ma:'',ma2:'',ju:'',vi:'',receso:true,label:'☕ Receso'});
  renderHorarioEditor(APP._horarioEdit);
}

function saveHorario(){
  if(!APP._horarioEdit||!APP._horarioEdit.length){toast('No hay cambios que guardar','error');return;}
  var grado=APP._editingHorario||'general';
  APP.horarios[grado]=JSON.parse(JSON.stringify(APP._horarioEdit));
  logAudit('config','Horario actualizado: '+(grado==='general'?'General':grado));
  // Notificar a estudiantes y padres afectados
  var afectados=grado==='general'?APP.students:(APP.students||[]).filter(function(s){return s.grado===grado;});
  var notifMsg='📅 El administrador actualizó el horario de '+(grado==='general'?'todos los grados':grado)+'. Revisa tu horario.';
  var count=0;
  afectados.forEach(function(st){
    addNotifToUser(st.email, notifMsg);
    if(st.emailPadre){
      var padre=(APP.padres||[]).find(function(p){return p.email===st.emailPadre;});
      if(padre) addNotifToUser(padre.email,'📅 Se actualizó el horario de su hijo/a '+st.nombre+' ('+grado+'). Inicie sesión para verlo.');
    }
    count++;
  });
  if(count>0) toast('✅ Horario guardado y notificado a '+count+' estudiante(s) y sus padres','success');
  else toast('✅ Horario guardado — '+(grado==='general'?'General':grado),'success');
}
function addNotifToUser(email,msg){
  if(!email)return;
  if(!APP._userNotifs)APP._userNotifs={};
  if(!APP._userNotifs[email])APP._userNotifs[email]=[];
  APP._userNotifs[email].unshift({msg:msg,fecha:new Date().toLocaleDateString('es-DO'),leido:false});
  if(APP.currentUser&&APP.currentUser.email===email) addNotification(msg);
}

function resetHorario(){
  if(!confirm('¿Restablecer el horario por defecto para este grado?'))return;
  var grado=APP._editingHorario||'general';
  delete APP.horarios[grado];
  APP._horarioEdit=JSON.parse(JSON.stringify(HORARIO_DEFAULT));
  renderHorarioEditor(APP._horarioEdit);
  renderHorarioPreview(APP._horarioEdit);
  toast('Horario restablecido','info');
}

// Auto-load general horario when tab opens
function initHorarioEditor(){
  APP._editingHorario='general';
  APP._horarioEdit=getHorario('general');
  var sel=document.getElementById('horario-grado-sel');if(sel)sel.value='general';
  renderHorarioEditor(APP._horarioEdit);
  renderHorarioPreview(APP._horarioEdit);
}


renderFbPosts();
updateCounters();
// Audit: log app start
logAudit('sistema','Sistema iniciado · C.E. Otilia Peláez','Sistema');
// ── Auto-restore sesión activa al abrir la página ────────────────
function tryAutoRestoreSession(){
  try{
    // Método 1: sesión activa guardada
    var activeRaw = localStorage.getItem('otiActiveSession');
    if(activeRaw){
      var active = JSON.parse(activeRaw);
      // Válida por 7 días
      if(active && active.user && (Date.now() - active.savedAt) < 7*24*60*60*1000){
        // Esperar a que APP cargue de Firebase
        setTimeout(function(){
          if(!APP.currentUser){
            loginAs(active.user);
            toast('👋 Bienvenido/a de nuevo, '+active.user.name+'!','success');
          }
        }, 800);
        return;
      } else {
        localStorage.removeItem('otiActiveSession');
      }
    }
    // Método 2: cuenta guardada en sessiones
    var sessions = JSON.parse(localStorage.getItem('otiSessions')||'{}');
    var keys = Object.keys(sessions);
    if(keys.length===1){
      // Si solo hay una cuenta guardada, intentar auto-login
      var s = sessions[keys[0]];
      if(s && s.email && s.pass){
        setTimeout(function(){
          if(!APP.currentUser) doLoginWith(s.email, s.pass);
        }, 600);
      }
    }
  }catch(e){}
}

// Load remembered accounts
loadRememberedAccounts();
// Auto-restaurar sesión si la había
setTimeout(tryAutoRestoreSession, 400);

// ===== GRADE / CICLO LOGIC =====
function checkRegGrado(){
  var grado=(document.getElementById('reg-grado')&&document.getElementById('reg-grado').value)||'';
  var carreraWrap=document.getElementById('reg-carrera-wrap');
  var esBachillerato=['4° Secundaria','5° Secundaria','6° Secundaria'].indexOf(grado)!==-1;
  if(carreraWrap)carreraWrap.style.display=esBachillerato?'block':'none';
  checkPadreEmailLink();
}
function checkSecundaria(){}

function checkStGrado(){}

function checkPadreEmailLink(){
  var emailPadreEl=document.getElementById('reg-email-padre');
  var msg=document.getElementById('reg-padre-link-msg');
  var madreWrap=document.getElementById('reg-madre-wrap');
  if(!emailPadreEl||!msg)return;
  var emailPadre=emailPadreEl.value.trim().toLowerCase();
  if(!emailPadre){
    msg.style.display='none';
    if(madreWrap)madreWrap.style.display='none';
    return;
  }
  var padreExiste=APP.padres.find(function(p){return p.email&&p.email.toLowerCase()===emailPadre;});
  if(padreExiste){
    msg.style.display='block';
    msg.textContent='✅ Vinculado a: '+padreExiste.nombre+' '+padreExiste.apellido;
    msg.style.color='var(--success)';
    if(madreWrap)madreWrap.style.display='block';
  } else {
    msg.style.display='block';
    msg.textContent='⚠️ No existe un padre registrado con ese correo';
    msg.style.color='#f59e0b';
    if(madreWrap)madreWrap.style.display='none';
  }
}

document.addEventListener('DOMContentLoaded',function(){
  var ep=document.getElementById('reg-email-padre');
  if(ep)ep.addEventListener('input',checkPadreEmailLink);
  // Also trigger check when reg-tipo changes to student
  var tipoSel=document.getElementById('reg-tipo');
  if(tipoSel)tipoSel.addEventListener('change',function(){
    if(this.value==='estudiante') setTimeout(checkPadreEmailLink,100);
  });
});

// ===== DESTACADOS & MERITORIOS =====
if(!APP.destacados)APP.destacados=[];
if(!APP.honorConfig)APP.honorConfig={titulo:'🏅 Cuadro de Honor · Trimestre 2025',subtitulo:'Felicitamos a nuestros estudiantes por su excelencia académica.',bg:'#16213e',accent:'#d4af37'};

var tiposDestacado={honor:{emoji:'🥇',label:'Cuadro de Honor',bg:'linear-gradient(135deg,#fef3c7,#fde68a)',border:'#d4af37'},meritorio:{emoji:'⭐',label:'Meritorio',bg:'linear-gradient(135deg,#dbeafe,#bfdbfe)',border:'#3b82f6'},destacado:{emoji:'🏅',label:'Destacado del Mes',bg:'linear-gradient(135deg,#d1fae5,#a7f3d0)',border:'#10b981'},conducta:{emoji:'😊',label:'Mejor Conducta',bg:'linear-gradient(135deg,#ede9fe,#ddd6fe)',border:'#8b5cf6'},deporte:{emoji:'⚽',label:'Deportista',bg:'linear-gradient(135deg,#fee2e2,#fecaca)',border:'#ef4444'},arte:{emoji:'🎨',label:'Talento Artístico',bg:'linear-gradient(135deg,#fce7f3,#fbcfe8)',border:'#ec4899'}};

function openDestacadoModal(){
  var dl=document.getElementById('dest-est-list');
  if(dl)dl.innerHTML=APP.students.map(function(s){return '<option value="'+s.nombre+' '+s.apellido+'">';}).join('');
  openModal('modal-destacado');
}

function saveDestacado(){
  var tipo=(document.getElementById('dest-tipo')&&document.getElementById('dest-tipo').value)||'honor';
  var nombre=(document.getElementById('dest-nombre')&&document.getElementById('dest-nombre').value.trim())||'';
  var grado=(document.getElementById('dest-grado')&&document.getElementById('dest-grado').value.trim())||'';
  var motivo=(document.getElementById('dest-motivo')&&document.getElementById('dest-motivo').value.trim())||'';
  var periodo=(document.getElementById('dest-periodo')&&document.getElementById('dest-periodo').value.trim())||'';
  if(!nombre)return toast('Ingresa el nombre del estudiante','error');
  if(!APP.destacados)APP.destacados=[];
  APP.destacados.push({id:Date.now(),tipo,nombre,grado,motivo,periodo,fecha:new Date().toLocaleDateString('es-DO')});
  closeModal('modal-destacado');
  renderDestacadosAdmin();renderDestacadosBanner();
  logAudit('usuario','Reconocimiento: '+nombre+' ('+tipo+')',APP.currentUser&&APP.currentUser.name);
  toast('Reconocimiento guardado','success');
  ['dest-nombre','dest-grado','dest-motivo'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
}

function deleteDestacado(id){
  APP.destacados=(APP.destacados||[]).filter(function(d){return d.id!==id;});
  renderDestacadosAdmin();renderDestacadosBanner();
  toast('Reconocimiento eliminado','info');
}

function renderDestacadosAdmin(){
  var el=document.getElementById('destacados-admin-list');if(!el)return;
  var list=APP.destacados||[];
  if(!list.length){el.innerHTML='<p style="color:#888;text-align:center;padding:24px;">No hay reconocimientos aún.</p>';return;}
  el.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px;">'+
    list.map(function(d){
      var t=tiposDestacado[d.tipo]||tiposDestacado.honor;
      return '<div style="background:'+t.bg+';border:2px solid '+t.border+';border-radius:14px;padding:16px;position:relative;">'+
        '<div style="font-size:26px;margin-bottom:4px;">'+t.emoji+'</div>'+
        '<p style="font-size:10px;font-weight:800;text-transform:uppercase;color:#555;margin:0 0 4px;">'+t.label+' · '+d.periodo+'</p>'+
        '<h4 style="margin:0 0 4px;color:var(--navy);font-size:14px;">'+d.nombre+'</h4>'+
        '<p style="font-size:12px;color:#666;margin:0;">'+d.grado+'</p>'+
        (d.motivo?'<p style="font-size:11px;color:#555;font-style:italic;margin:4px 0 0;">'+d.motivo+'</p>':'')+
        '<button onclick="deleteDestacado('+d.id+')" style="position:absolute;top:10px;right:10px;background:none;border:1px solid rgba(0,0,0,0.2);border-radius:6px;padding:2px 8px;font-size:11px;cursor:pointer;">🗑</button>'+
      '</div>';
    }).join('')+'</div>';
}

function saveHonorConfig(){
  var t=document.getElementById('honor-titulo');var s=document.getElementById('honor-subtitulo');
  var bg=document.getElementById('honor-bg');var acc=document.getElementById('honor-accent');
  APP.honorConfig={titulo:t&&t.value||'🏅 Cuadro de Honor',subtitulo:s&&s.value||'',bg:bg&&bg.value||'#16213e',accent:acc&&acc.value||'#d4af37'};
  renderDestacadosBanner();
  toast('Banner de honor guardado','success');
}

function renderDestacadosBanner(){
  var el=document.getElementById('est-destacados-banner');if(!el||!APP.currentUser)return;
  var list=APP.destacados||[];
  if(!list.length){el.style.display='none';return;}
  var user=APP.currentUser;
  var misD=list.filter(function(d){
    var fn=(user.name||'').toLowerCase();
    return d.nombre.toLowerCase()===fn||d.nombre.toLowerCase().indexOf(fn.split(' ')[0].toLowerCase())!==-1;
  });
  var cfg=APP.honorConfig||{titulo:'🏅 Cuadro de Honor',subtitulo:'',bg:'#16213e',accent:'#d4af37'};
  el.style.display='block';
  var html='';
  if(misD.length){
    html+='<div style="background:linear-gradient(135deg,'+cfg.bg+',#1a4a7a);border:2px solid '+cfg.accent+';border-radius:16px;padding:18px;margin-bottom:12px;text-align:center;">'+
      '<div style="font-size:32px;">🎉</div>'+
      '<h3 style="color:'+cfg.accent+';margin:4px 0;font-family:\'Playfair Display\',serif;">¡Felicitaciones!</h3>'+
      misD.map(function(d){var t=tiposDestacado[d.tipo]||tiposDestacado.honor;return '<div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:10px;padding:6px 14px;margin:4px;color:white;font-size:13px;">'+t.emoji+' <strong>'+t.label+'</strong> · '+d.periodo+'</div>';}).join('')+
    '</div>';
  }
  html+='<div style="background:white;border:1px solid var(--border);border-radius:14px;padding:16px;">'+
    '<h4 style="color:var(--navy);margin:0 0 10px;">'+cfg.titulo+'</h4>'+
    '<p style="color:#666;font-size:13px;margin:0 0 12px;">'+cfg.subtitulo+'</p>'+
    '<div style="display:flex;flex-wrap:wrap;gap:6px;">'+
    list.map(function(d){var t=tiposDestacado[d.tipo]||tiposDestacado.honor;return '<span style="background:'+t.bg+';border:1px solid '+t.border+';border-radius:20px;padding:4px 11px;font-size:12px;font-weight:700;">'+t.emoji+' '+d.nombre+(d.grado?' · '+d.grado:'')+'</span>';}).join('')+
    '</div></div>';
  el.innerHTML=html;
}

// ===== AI CHAT WIDGET =====
var chatOpen=false;
var chatHistory=[];

var CHAT_KNOWLEDGE={
  inscripciones:{keys:['inscripcion','inscribir','matricula','matricular','registro'],resp:'📝 Las inscripciones están disponibles en la sección **"Inscripción"** del menú. Puedes completarlo en línea o acercarte al centro en horario de 7:30 AM–4:30 PM, lunes a viernes. ¿Necesitas más información?'},
  horario:{keys:['horario','hora','clase','clases','entrada','salida','recreo'],resp:'⏰ El horario escolar es de **7:30 AM a 4:30 PM**, lunes a viernes. El recreo es de 9:45 a 10:00 AM. Puedes ver tu horario detallado en la pestaña **"Horario"** de tu portal.'},
  notas:{keys:['nota','notas','calificacion','promedio','materia','reprobar','aprobar'],resp:'📋 Tus notas están en la pestaña **"Mis Notas"**. El mínimo para aprobar es **65**. Meritorios: 80–89. Cuadro de Honor: **90 o más**. ¿Tienes preguntas sobre alguna materia específica?'},
  anuncios:{keys:['anuncio','aviso','evento','noticia','actividad','comunicado'],resp:'📢 Los anuncios del centro están en la pestaña **"Anuncios"** de tu portal. La directora y los maestros los publican regularmente. ¿Hay algún tema específico que buscas?'},
  ausencias:{keys:['ausencia','ausente','falta','faltar','excusa','justificacion'],resp:'📅 Para justificar una ausencia, tu padre/tutor debe entrar a su portal y usar la sección **"Excusas"**. Se puede adjuntar un documento médico o escrito como justificación.'},
  uniforme:{keys:['uniforme','ropa','vestimenta','pantalon','falda','camisa'],resp:'👔 Uniforme oficial: **camisa blanca** con el logo del centro, **pantalón/falda azul marino** y zapatos negros. Para educación física: uniforme deportivo azul y blanco.'},
  contacto:{keys:['contacto','telefono','correo','email','direccion','ubicacion','donde','mapa'],resp:'📍 Ubicación: **Av. Charles de Gaulle, Sabana Perdida, SDN**. 📞 **(809) 590-0771**. 📧 otiliapelaezadm@gmail.com. También por WhatsApp al mismo número.'},
  directora:{keys:['directora','monja','hermana','sor','cesarina'],resp:'👩‍💼 La directora es **Sor Cesarina Altagracia Paulino Fernández**, de la comunidad de Hermanas de San Pablo. Disponible lunes a viernes para atender padres y estudiantes.'},
  grados:{keys:['grado','nivel','primaria','secundaria','bachillerato','carrera','ciclo'],resp:'🎓 El centro ofrece **Primaria** (1°–6°) en 1er y 2do ciclo, y **Secundaria** (1°–6°). El bachillerato es el 2do ciclo de secundaria (4°, 5° y 6°). Bachilleratos: General, Informática, Contabilidad, Educación, Turismo, Ciencias de la Salud.'},
  destacados:{keys:['honor','meritorio','destacado','reconocimiento','premio','cuadro'],resp:'🏅 El **Cuadro de Honor** es para promedios de 90 o más. Los **Meritorios** son los de 80–89. Los reconocidos aparecen en su portal con una distinción especial. ¡Sigue esforzándote!'},
};

function toggleChat(){
  chatOpen=!chatOpen;
  var win=document.getElementById('chat-window');
  if(win){win.style.display=chatOpen?'flex':'none';}
  var dot=document.getElementById('chat-notif-dot');
  if(dot)dot.style.display='none';
  if(chatOpen&&chatHistory.length===0){
    var nombre=APP.currentUser&&APP.currentUser.name?APP.currentUser.name.split(' ')[0]:'';
    addChatMsg('bot','¡Hola'+(nombre?', '+nombre:'')+'! 👋 Soy el **Asistente Otilia**, tu ayudante virtual del Centro Educativo. ¿En qué puedo ayudarte hoy?');
    renderQuickReplies(['📝 Inscripciones','📋 Ver mis notas','⏰ Horario escolar','📢 Anuncios recientes','📍 Contacto']);
  }
}

function addChatMsg(from,text){
  chatHistory.push({from:from,text:text,time:new Date().toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'})});
  renderChatMessages();
}

function renderChatMessages(){
  var el=document.getElementById('chat-messages');if(!el)return;
  el.innerHTML=chatHistory.map(function(m){
    var isBot=m.from==='bot';
    var txt=m.text.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
    return isBot
      ?'<div style="display:flex;gap:8px;align-items:flex-end;"><div style="width:28px;height:28px;background:var(--gold);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">🤖</div><div style="background:#f0f4ff;border-radius:14px 14px 14px 2px;padding:10px 13px;max-width:80%;"><p style="margin:0;font-size:13px;line-height:1.5;color:var(--navy);">'+txt+'</p><span style="font-size:10px;color:#aaa;">'+m.time+'</span></div></div>'
      :'<div style="display:flex;justify-content:flex-end;"><div style="background:linear-gradient(135deg,var(--navy),var(--blue));border-radius:14px 14px 2px 14px;padding:10px 13px;max-width:80%;"><p style="margin:0;font-size:13px;color:white;line-height:1.5;">'+txt+'</p><span style="font-size:10px;color:rgba(255,255,255,0.6);">'+m.time+'</span></div></div>';
  }).join('');
  el.scrollTop=el.scrollHeight;
}

function renderQuickReplies(replies){
  var el=document.getElementById('chat-quick');if(!el)return;
  el.innerHTML=replies.map(function(r){
    return '<button onclick="quickReply(\''+r.replace(/'/g,"\\'")+'\')" style="background:#f0f4ff;border:1px solid var(--blue);border-radius:20px;padding:5px 11px;font-size:12px;cursor:pointer;color:var(--navy);font-family:\'Nunito\',sans-serif;white-space:nowrap;">'+r+'</button>';
  }).join('');
}

function quickReply(text){
  addChatMsg('user',text);
  renderQuickReplies([]);
  setTimeout(function(){processChatMsg(text);},500);
}

function sendChat(){
  var inp=document.getElementById('chat-input');if(!inp)return;
  var msg=inp.value.trim();if(!msg)return;
  addChatMsg('user',msg);inp.value='';
  renderQuickReplies([]);
  setTimeout(function(){processChatMsg(msg);},600);
}

function processChatMsg(msg){
  var lower=msg.toLowerCase();
  var keys=Object.keys(CHAT_KNOWLEDGE);
  for(var i=0;i<keys.length;i++){
    var entry=CHAT_KNOWLEDGE[keys[i]];
    if(entry.keys.some(function(kw){return lower.indexOf(kw)!==-1;})){
      addChatMsg('bot',entry.resp);
      renderQuickReplies(['👍 Entendido','¿Algo más?','📍 Contacto del centro']);
      return;
    }
  }
  if(lower.indexOf('promedio')!==-1||lower.indexOf('como voy')!==-1){
    var gpa=document.getElementById('st-gpa');
    var avg=gpa&&gpa.textContent!=='—'?gpa.textContent:'aún no disponible';
    addChatMsg('bot','📊 Tu promedio general actual es **'+avg+'**. Recuerda: mínimo 65 para aprobar, 80+ Meritorio, 90+ Cuadro de Honor. ¡Tú puedes!');
    return;
  }
  if(lower.indexOf('hola')!==-1||lower.indexOf('buenas')!==-1||lower.indexOf('buenos')!==-1){
    addChatMsg('bot','😊 ¡Hola! Estoy aquí para orientarte. Puedo ayudarte con inscripciones, notas, horarios, anuncios del centro y más.');
    renderQuickReplies(['📝 Inscripciones','📋 Mis notas','⏰ Horario','📍 Ubicación']);
    return;
  }
  if(lower.indexOf('gracias')!==-1||lower.indexOf('perfecto')!==-1||lower.indexOf('ok')!==-1){
    addChatMsg('bot','¡Con gusto! 😊 Si tienes más preguntas, aquí estaré. ¡Mucho éxito!');
    renderQuickReplies(['📝 Otra pregunta','👋 Cerrar chat']);
    return;
  }
  if(lower.indexOf('cerrar')!==-1||lower.indexOf('adios')!==-1||lower.indexOf('bye')!==-1){
    addChatMsg('bot','¡Hasta luego! 👋 Que tengas un excelente día en el centro.');
    setTimeout(function(){toggleChat();chatOpen=false;var win=document.getElementById('chat-window');if(win)win.style.display='none';},1500);
    return;
  }
  var lastAnn=APP.announcements&&APP.announcements[0];
  if(lower.indexOf('nuevo')!==-1||lower.indexOf('reciente')!==-1||lower.indexOf('ultimo')!==-1){
    if(lastAnn){addChatMsg('bot','📢 El anuncio más reciente: **"'+lastAnn.titulo+'"** — '+lastAnn.desc.substring(0,80)+'... Ve a la pestaña Anuncios para verlo completo.');}
    else{addChatMsg('bot','📢 No hay anuncios recientes ahora mismo. ¡Revísalos pronto!');}
    return;
  }
  addChatMsg('bot','Hmm, no tengo información exacta sobre eso 🤔 Pero puedo orientarte sobre inscripciones, notas, horarios, anuncios y datos del centro. ¿Qué necesitas?');
  renderQuickReplies(['📝 Inscripciones','📋 Notas','⏰ Horario','📍 Contacto']);
}

function showChatWidget(show){
  var w=document.getElementById('chat-widget');
  if(w)w.style.display=show?'block':'none';
  if(!show&&chatOpen){chatOpen=false;var win=document.getElementById('chat-window');if(win)win.style.display='none';}
}

// ================================================
//   BOT CONFIG — Admin Panel
// ================================================
if(!APP.botConfig)APP.botConfig={
  nombre:'Asistente Otilia',
  emoji:'🤖',
  color:'#16213e',
  msgColor:'#f0f4ff',
  foto:null,
  bienvenida:'¡Hola {nombre}! 👋 Soy el Asistente Otilia, tu ayudante virtual del Centro Educativo. ¿En qué puedo ayudarte hoy?',
  despedida:'¡Hasta luego! 👋 Que tengas un excelente día en el centro.',
  quickReplies:'📝 Inscripciones,📋 Ver mis notas,⏰ Horario escolar,📢 Anuncios,📍 Contacto',
  autoAusencias:true, autoNotas:true, autoAnuncios:true, autoIa:false, iaKey:'',
  autoBadge:true, autoOpen:false, delay:600,
  horaInicio:'07:00', horaFin:'18:00', siempreActivo:true,
  dias:{lun:true,mar:true,mie:true,jue:true,vie:true,sab:false,dom:false},
  accEst:true, accPadre:true, accProf:false, accPublico:false,
  blockedWords:'', blockedMsg:'Lo siento, no puedo responder sobre ese tema. ¿Puedo ayudarte con algo del centro?',
  respuestas:[
    {keys:'inscripcion,inscribir,matricula',resp:'📝 Las inscripciones están en la sección **"Inscripción"** del menú. Horario: lunes a viernes 7:30 AM–4:30 PM.'},
    {keys:'horario,hora,clase',resp:'⏰ El horario escolar es de **7:30 AM a 4:30 PM**, lunes a viernes. Ve a la pestaña **"Horario"** de tu portal.'},
    {keys:'nota,notas,promedio',resp:'📋 Tus notas están en la pestaña **"Mis Notas"**. Mínimo para aprobar: **65**. Meritorio: 80–89. Honor: **90+**.'},
    {keys:'contacto,telefono,direccion,ubicacion',resp:'📍 Av. Charles de Gaulle, Sabana Perdida, SDN. 📞 (809) 590-0771. WhatsApp al mismo número.'},
  ],
  stats:{totalMsgs:0, usuariosUnicos:0, preguntasFrecuentes:{}}
};

function showBotTab(id,btn){
  document.querySelectorAll('.bot-tab-section').forEach(function(s){s.style.display='none';});
  var el=document.getElementById(id);if(el)el.style.display='block';
  document.querySelectorAll('#dash-bot-config .cfg-tab').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');
  if(id==='bot-respuestas')renderBotRespuestas();
  if(id==='bot-estadisticas')renderBotEstadisticas();
}

function initBotConfig(){
  // Render profile selector tabs if not already rendered
  var selWrap = document.getElementById('bot-profile-selector');
  if(selWrap && !selWrap.dataset.init){
    selWrap.dataset.init='1';
    selWrap.innerHTML=[
      {k:'estudiante',lbl:'🎓 Estudiante',cfg:'botConfig'},
      {k:'padre',     lbl:'👪 Padre',     cfg:'botPadreConfig'},
      {k:'profe',     lbl:'📚 Maestro',   cfg:'botProfeConfig'},
      {k:'admin',     lbl:'🏛️ Admin',    cfg:'botAdminConfig'},
    ].map(function(r,i){
      return '<button class="cfg-tab'+(i===0?' active':'')+'" onclick="switchBotProfile(\''+r.cfg+'\',this)" style="font-size:13px;">'+r.lbl+'</button>';
    }).join('');
  }
  window._activeBotCfgKey = window._activeBotCfgKey || 'botConfig';
  var c=APP[window._activeBotCfgKey] || APP.botConfig;
  setValue('bot-nombre',c.nombre);
  setValue('bot-emoji',c.emoji);
  setValue('bot-bienvenida',c.bienvenida);
  setValue('bot-despedida',c.despedida);
  setValue('bot-color',c.color);
  setValue('bot-msg-color',c.msgColor);
  setValue('bot-quick-replies',c.quickReplies);
  setCheck('bot-auto-ausencias',c.autoAusencias);
  setCheck('bot-auto-notas',c.autoNotas);
  setCheck('bot-auto-anuncios',c.autoAnuncios);
  setCheck('bot-auto-ia',c.autoIa);
  setCheck('bot-auto-badge',c.autoBadge);
  setCheck('bot-auto-open',c.autoOpen);
  setCheck('bot-siempre-activo',c.siempreActivo);
  setCheck('bot-acc-est',c.accEst);
  setCheck('bot-acc-padre',c.accPadre);
  setCheck('bot-acc-prof',c.accProf);
  setCheck('bot-acc-publico',c.accPublico);
  setValue('bot-delay',c.delay);
  document.getElementById('bot-delay-val').textContent=c.delay+'ms';
  setValue('bot-hora-inicio',c.horaInicio);
  setValue('bot-hora-fin',c.horaFin);
  setValue('bot-blocked-words',c.blockedWords);
  setValue('bot-blocked-msg',c.blockedMsg);
  setCheck('bd-lun',c.dias.lun);setCheck('bd-mar',c.dias.mar);setCheck('bd-mie',c.dias.mie);
  setCheck('bd-jue',c.dias.jue);setCheck('bd-vie',c.dias.vie);setCheck('bd-sab',c.dias.sab);setCheck('bd-dom',c.dias.dom);
  // Avatar
  var av=document.getElementById('bot-avatar-preview');
  var bp=document.getElementById('bot-bubble-preview');
  if(c.foto){
    if(av)av.innerHTML='<img src="'+c.foto+'" style="width:100%;height:100%;object-fit:cover;">';
    if(bp)bp.innerHTML='<img src="'+c.foto+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
  } else {
    if(av)av.textContent=c.emoji;
    if(bp)bp.textContent=c.emoji;
  }
  previewBotColor(c.color);
  // show bubble tab initially
  showBotTab('bot-identidad', document.querySelector('#dash-bot-config .cfg-tab'));
}

function switchBotProfile(cfgKey, btn){
  window._activeBotCfgKey = cfgKey;
  document.querySelectorAll('#bot-profile-selector .cfg-tab').forEach(function(b){b.classList.remove('active');});
  if(btn) btn.classList.add('active');
  // Reload fields with new config
  var c = APP[cfgKey] || APP.botConfig;
  setValue('bot-nombre', c.nombre||'');
  setValue('bot-emoji',  c.emoji||'🤖');
  setValue('bot-bienvenida', c.bienvenida||'');
  setValue('bot-despedida',  c.despedida||'');
  setValue('bot-color',      c.color||'#16213e');
  setValue('bot-quick-replies', c.quickReplies||'');
  // Update preview bubble
  previewBotColor(c.color||'#16213e');
  var av=document.getElementById('bot-avatar-preview');
  var bp=document.getElementById('bot-bubble-preview');
  if(av) av.textContent=c.emoji||'🤖';
  if(bp) bp.textContent=c.emoji||'🤖';
}

function setValue(id,val){var el=document.getElementById(id);if(el)el.value=val;}
function setCheck(id,val){var el=document.getElementById(id);if(el)el.checked=!!val;}
function getVal(id){var el=document.getElementById(id);return el?el.value:'';}
function getCheck(id){var el=document.getElementById(id);return el?el.checked:false;}

function saveBotConfig(){
  var activeKey = window._activeBotCfgKey || 'botConfig';
  if(!APP[activeKey]) APP[activeKey] = {};
  var c = APP[activeKey];
  c.nombre=getVal('bot-nombre')||'Asistente Otilia';
  c.emoji=getVal('bot-emoji')||'🤖';
  c.bienvenida=getVal('bot-bienvenida');
  c.despedida=getVal('bot-despedida');
  c.color=getVal('bot-color');
  c.msgColor=getVal('bot-msg-color');
  c.quickReplies=getVal('bot-quick-replies');
  c.autoAusencias=getCheck('bot-auto-ausencias');
  c.autoNotas=getCheck('bot-auto-notas');
  c.autoAnuncios=getCheck('bot-auto-anuncios');
  c.autoIa=getCheck('bot-auto-ia');
  c.iaKey=getVal('bot-ia-key');
  c.autoBadge=getCheck('bot-auto-badge');
  c.autoOpen=getCheck('bot-auto-open');
  c.siempreActivo=getCheck('bot-siempre-activo');
  c.delay=parseInt(getVal('bot-delay'))||600;
  c.horaInicio=getVal('bot-hora-inicio');
  c.horaFin=getVal('bot-hora-fin');
  c.blockedWords=getVal('bot-blocked-words');
  c.blockedMsg=getVal('bot-blocked-msg');
  c.accEst=getCheck('bot-acc-est');
  c.accPadre=getCheck('bot-acc-padre');
  c.accProf=getCheck('bot-acc-prof');
  c.accPublico=getCheck('bot-acc-publico');
  c.dias={lun:getCheck('bd-lun'),mar:getCheck('bd-mar'),mie:getCheck('bd-mie'),jue:getCheck('bd-jue'),vie:getCheck('bd-vie'),sab:getCheck('bd-sab'),dom:getCheck('bd-dom')};
  // Save respuestas from DOM
  var rows=document.querySelectorAll('.bot-resp-row');
  c.respuestas=[];
  rows.forEach(function(r){
    var k=r.querySelector('.resp-keys');var t=r.querySelector('.resp-text');
    if(k&&t&&k.value.trim())c.respuestas.push({keys:k.value.trim(),resp:t.value.trim()});
  });
  // Apply to live bot
  applyBotConfigLive();
  logAudit('config','Configuración del bot actualizada');
  toast('✅ Configuración del bot guardada y aplicada','success');
  persistSave();
}

function applyBotConfigLive(){
  var c=APP.botConfig;
  // Update bubble
  var bubble=document.getElementById('chat-bubble');
  if(bubble)bubble.style.background=c.color;
  // Update emoji/foto in bubble
  var emojiSpan=bubble&&bubble.childNodes[1];
  // Update CHAT_KNOWLEDGE with custom respuestas
  c.respuestas.forEach(function(r,i){
    CHAT_KNOWLEDGE['custom_'+i]={keys:r.keys.split(',').map(function(k){return k.trim().toLowerCase();}),resp:r.resp};
  });
  // Update quick replies on next open
  // Badge
  var badge=document.getElementById('chat-notif-badge');
  if(badge&&c.autoBadge&&APP.announcements&&APP.announcements.length>0)badge.style.display='flex';
  // Access control — update showChatWidget based on current user
  if(APP.currentUser){
    var role=APP.currentUser.role;
    var show=(role==='estudiante'&&c.accEst)||(role==='padre'&&c.accPadre)||(role==='profesor'&&c.accProf);
    showChatWidget(show);
  }
}

function resetBotConfig(){
  if(!confirm('¿Restablecer toda la configuración del bot por defecto?'))return;
  var activeKey = window._activeBotCfgKey || 'botConfig';
  APP[activeKey]=null;
  // Re-init default
  APP[activeKey]={nombre:'Asistente Otilia',emoji:'🤖',color:'#16213e',msgColor:'#f0f4ff',foto:null,
    bienvenida:'¡Hola {nombre}! 👋 Soy el Asistente Otilia, tu ayudante virtual. ¿En qué puedo ayudarte?',
    despedida:'¡Hasta luego! 👋',quickReplies:'📝 Inscripciones,📋 Mis notas,⏰ Horario,📢 Anuncios,📍 Contacto',
    autoAusencias:true,autoNotas:true,autoAnuncios:true,autoIa:false,iaKey:'',autoBadge:true,autoOpen:false,delay:600,
    horaInicio:'07:00',horaFin:'18:00',siempreActivo:true,
    dias:{lun:true,mar:true,mie:true,jue:true,vie:true,sab:false,dom:false},
    accEst:true,accPadre:true,accProf:false,accPublico:false,
    blockedWords:'',blockedMsg:'Lo siento, no puedo responder sobre ese tema.',
    respuestas:[],stats:{totalMsgs:0,usuariosUnicos:0,preguntasFrecuentes:{}}};
  initBotConfig();
  toast('Bot restablecido a configuración por defecto','info');
  persistSave();
}

function previewBotColor(color){
  var bp=document.getElementById('bot-bubble-preview');
  if(bp)bp.style.background=color;
}

function previewBotFoto(e){
  var file=e.target.files[0];if(!file)return;
  var r=new FileReader();
  r.onload=function(ev){
    APP.botConfig.foto=ev.target.result;
    var av=document.getElementById('bot-avatar-preview');
    var bp=document.getElementById('bot-bubble-preview');
    if(av)av.innerHTML='<img src="'+ev.target.result+'" style="width:100%;height:100%;object-fit:cover;">';
    if(bp)bp.innerHTML='<img src="'+ev.target.result+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
    // Update live bubble
    var bubble=document.getElementById('chat-bubble');
    if(bubble){
      var existImg=bubble.querySelector('img.bot-foto');
      if(!existImg){var img=document.createElement('img');img.className='bot-foto';img.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:50%;position:absolute;inset:0;';bubble.style.overflow='hidden';bubble.style.position='relative';bubble.insertBefore(img,bubble.firstChild);}
      bubble.querySelector('img.bot-foto').src=ev.target.result;
    }
  };
  r.readAsDataURL(file);
}

function resetBotFoto(){
  APP.botConfig.foto=null;
  var av=document.getElementById('bot-avatar-preview');
  var bp=document.getElementById('bot-bubble-preview');
  var emoji=APP.botConfig.emoji||'🤖';
  if(av)av.textContent=emoji;
  if(bp){bp.textContent=emoji;bp.style.fontSize='24px';}
  var bubble=document.getElementById('chat-bubble');
  if(bubble){var img=bubble.querySelector('img.bot-foto');if(img)img.remove();}
}

function renderBotRespuestas(){
  var c=APP.botConfig;
  var list=document.getElementById('bot-respuestas-list');if(!list)return;
  if(!c.respuestas||c.respuestas.length===0){
    list.innerHTML='<p style="color:#888;font-size:13px;text-align:center;padding:20px;">No hay respuestas personalizadas. Haz clic en "+ Agregar respuesta" para comenzar.</p>';
    return;
  }
  list.innerHTML=c.respuestas.map(function(r,i){
    return '<div class="bot-resp-row">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'+
        '<span style="font-size:12px;font-weight:700;color:var(--navy);">Respuesta #'+(i+1)+'</span>'+
        '<button onclick="deleteBotRespuesta('+i+')" style="background:none;border:none;color:#ef4444;font-size:16px;cursor:pointer;">🗑</button>'+
      '</div>'+
      '<input class="resp-keys" type="text" value="'+escHtml(r.keys)+'" placeholder="Palabras clave separadas por coma (ej: horario,hora,clases)">'+
      '<textarea class="resp-text" rows="3" placeholder="Respuesta del bot...">'+escHtml(r.resp)+'</textarea>'+
    '</div>';
  }).join('');
}

function escHtml(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function addBotRespuesta(){
  if(!APP.botConfig.respuestas)APP.botConfig.respuestas=[];
  APP.botConfig.respuestas.push({keys:'nueva,palabra',resp:'Escribe aquí la respuesta del bot...'});
  renderBotRespuestas();
}

function deleteBotRespuesta(idx){
  APP.botConfig.respuestas.splice(idx,1);
  renderBotRespuestas();
}

function renderBotEstadisticas(){
  var s=APP.botConfig.stats||{totalMsgs:0,usuariosUnicos:0,preguntasFrecuentes:{}};
  // Count from chatHistory all sessions
  var totalReal=(APP._botStats&&APP._botStats.totalMsgs)||s.totalMsgs||0;
  var unicos=(APP._botStats&&APP._botStats.unicos)||0;
  var grid=document.getElementById('bot-stats-grid');
  if(grid) grid.innerHTML=[
    {icon:'💬',num:totalReal,lbl:'Mensajes totales'},
    {icon:'👤',num:unicos,lbl:'Usuarios únicos'},
    {icon:'✅',num:(APP._botStats&&APP._botStats.resueltos)||0,lbl:'Consultas resueltas'},
    {icon:'❓',num:(APP._botStats&&APP._botStats.sinRespuesta)||0,lbl:'Sin respuesta'},
  ].map(function(k){
    return '<div class="kpi-card"><div class="kpi-icon">'+k.icon+'</div><div><div class="kpi-num">'+k.num+'</div><div class="kpi-label">'+k.lbl+'</div></div></div>';
  }).join('');

  var pf=document.getElementById('bot-top-preguntas');
  var freq=APP._botStats&&APP._botStats.freq||{};
  var sorted=Object.keys(freq).sort(function(a,b){return freq[b]-freq[a];}).slice(0,8);
  if(pf) pf.innerHTML=sorted.length===0
    ?'<p style="color:#888;font-size:13px;">No hay datos aún. Las estadísticas se registran cuando los usuarios usan el bot.</p>'
    :sorted.map(function(k){
      return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;background:#f8fafc;padding:8px 12px;border-radius:8px;">'+
        '<span style="font-size:18px;">🔍</span>'+
        '<span style="flex:1;font-size:13px;color:var(--navy);">'+escHtml(k)+'</span>'+
        '<span style="background:var(--gold);color:var(--navy);padding:2px 10px;border-radius:20px;font-size:12px;font-weight:700;">'+freq[k]+'x</span>'+
      '</div>';
    }).join('');
}

function exportBotStats(){
  var s=JSON.stringify(APP._botStats||{},null,2);
  var a=document.createElement('a');
  a.href='data:application/json;charset=utf-8,'+encodeURIComponent(s);
  a.download='bot_estadisticas.json';a.click();
}

function clearBotStats(){
  if(!confirm('¿Limpiar todo el historial de estadísticas del bot?'))return;
  APP._botStats={totalMsgs:0,unicos:0,resueltos:0,sinRespuesta:0,freq:{}};
  renderBotEstadisticas();
  toast('Historial del bot limpiado','info');
}

// ---- Hook into processChatMsg to track stats & apply config ----
var _origProcessChatMsg=processChatMsg;
processChatMsg=function(msg){
  // Track stats
  if(!APP._botStats)APP._botStats={totalMsgs:0,unicos:0,resueltos:0,sinRespuesta:0,freq:{}};
  APP._botStats.totalMsgs++;
  var lower=msg.toLowerCase();
  // Check blocked words
  var c=APP.botConfig;
  if(c&&c.blockedWords){
    var blocked=c.blockedWords.split(',').map(function(w){return w.trim().toLowerCase();}).filter(Boolean);
    if(blocked.some(function(w){return lower.indexOf(w)!==-1;})){
      addChatMsg('bot',c.blockedMsg||'Lo siento, no puedo responder sobre ese tema.');
      return;
    }
  }
  // Track freq
  APP._botStats.freq[msg.substring(0,40)]=(APP._botStats.freq[msg.substring(0,40)]||0)+1;
  // Check custom respuestas from config
  if(c&&c.respuestas){
    for(var i=0;i<c.respuestas.length;i++){
      var r=c.respuestas[i];
      var keys=r.keys.split(',').map(function(k){return k.trim().toLowerCase();});
      if(keys.some(function(k){return lower.indexOf(k)!==-1;})){
        addChatMsg('bot',r.resp);
        APP._botStats.resueltos++;
        renderQuickReplies(['👍 Entendido','¿Algo más?','📍 Contacto']);
        return;
      }
    }
  }
  // Horario check
  if(c&&!c.siempreActivo){
    var now=new Date();var h=now.getHours();var m=now.getMinutes();
    var [hi,mi]=(c.horaInicio||'07:00').split(':').map(Number);
    var [hf,mf]=(c.horaFin||'18:00').split(':').map(Number);
    var mins=h*60+m, start=hi*60+mi, end=hf*60+mf;
    if(mins<start||mins>end){addChatMsg('bot',c.msgOffline||'El asistente no está disponible ahora.');return;}
  }
  _origProcessChatMsg(msg);
  APP._botStats.resueltos++;
};

// Hook toggleChat to use bot config bienvenida & quick replies
var _origToggleChat=toggleChat;
toggleChat=function(){
  var c=APP.botConfig;
  chatOpen=!chatOpen;
  var win=document.getElementById('chat-window');
  if(win){win.style.display=chatOpen?'flex':'none';}
  var dot=document.getElementById('chat-notif-dot');if(dot)dot.style.display='none';
  var badge=document.getElementById('chat-notif-badge');if(badge)badge.style.display='none';
  if(chatOpen&&chatHistory.length===0){
    var nombre=APP.currentUser&&APP.currentUser.name?APP.currentUser.name.split(' ')[0]:'';
    var bienvenida=(c&&c.bienvenida||'¡Hola {nombre}! 👋 Soy el Asistente Otilia.').replace('{nombre}',nombre||'');
    addChatMsg('bot',bienvenida);
    var qr=(c&&c.quickReplies)?c.quickReplies.split(',').map(function(s){return s.trim();}):['📝 Inscripciones','📋 Mis notas','⏰ Horario','📢 Anuncios','📍 Contacto'];
    renderQuickReplies(qr);
    // Track unique user
    if(!APP._botStats)APP._botStats={totalMsgs:0,unicos:0,resueltos:0,sinRespuesta:0,freq:{}};
    if(APP.currentUser){
      if(!APP._botUsers)APP._botUsers={};
      if(!APP._botUsers[APP.currentUser.email]){APP._botUsers[APP.currentUser.email]=true;APP._botStats.unicos++;}
    }
  }
};


// ================================================
//  BOT FLOTANTE POR ROL — padre / profe / admin
// ================================================

// Prefix map: role → element id prefix
var FAB_PFX = {padre:'bfp', profe:'bfpr', admin:'bfa'};

// Knowledge bases
var KB_PADRE = {
  nota:    {k:['nota','notas','promedio','calificacion','como va'],  r:'📋 Las notas de su hijo/a están en la pestaña **"Notas"** de su portal. Se actualizan cuando el maestro las registra. Mínimo aprobatorio: **65 puntos**.'},
  ausencia:{k:['ausencia','falta','justificar','excusa','inasistencia'], r:'📅 Para justificar una ausencia vaya a **"Excusas"** en su portal, complete el formulario y adjunte el documento. Debe hacerlo dentro de los **3 días** siguientes.'},
  horario: {k:['horario','hora','entrada','salida','clase'],          r:'⏰ El horario escolar es **7:30 AM – 4:30 PM**, lunes a viernes. El horario detallado está en la pestaña **"Horario"** de su portal.'},
  mensaje: {k:['hablar','maestro','comunicar','mensaje','reunion'],   r:'💬 Use la sección **"Mensajes"** de su portal para contactar al maestro. También puede llamar al centro: **(809) 590-0771**.'},
  uniforme:{k:['uniforme','ropa','vestimenta'],                       r:'👔 Uniforme: **camisa blanca** con logo, **pantalón/falda azul marino** y zapatos negros. Educación física: uniforme deportivo azul y blanco.'},
  inscripcion:{k:['inscripcion','matricula','inscribir','nuevo año'], r:'📝 Las inscripciones están en la sección **"Inscripciones"** de su portal. También puede acercarse al centro lunes–viernes de 7:30 AM a 4:30 PM.'},
  reglamento:{k:['reglamento','norma','regla','disciplina'],          r:'📋 El reglamento del centro puede solicitarlo en secretaría. Los estudiantes deben respetar las normas de convivencia según el Reglamento Interno.'},
  beca:    {k:['beca','superate','apoyo','ayuda economica'],          r:'🎓 El programa **Supérate** del MINERD otorga becas a estudiantes con buen rendimiento y necesidad económica. Consulte al orientador del centro.'},
  contacto:{k:['contacto','telefono','direccion','donde'],            r:'📍 **Av. Charles de Gaulle, Sabana Perdida, SDN**. 📞 **(809) 590-0771**. WhatsApp al mismo número. Horario: lunes–viernes 7:30 AM–4:30 PM.'},
};

var KB_PROFE = {
  ley66:   {k:['ley 66','ley general','66-97','educacion dominicana'], r:'📖 La **Ley General de Educación 66-97** es la norma principal del sistema educativo dominicano. Regula estructura, derechos y obligaciones. Disponible en: minerd.gob.do'},
  carrera: {k:['ley 41','carrera docente','estatuto','escalafon'],    r:'👨‍🏫 La **Ley de Carrera Docente 41-00** regula el ingreso, estabilidad, ascenso y derechos de los maestros. Garantiza formación continua y estabilidad laboral.'},
  planif:  {k:['planificacion','plan','proyecto','didactica','curricular'], r:'📝 La planificación debe alinearse al **Currículo Dominicano Revisado**. Presente planes semanales y de unidad a coordinación. El MINERD ofrece plantillas oficiales.'},
  notas:   {k:['registrar nota','calificar','boletin','informe'],      r:'📋 Registre notas en la sección **"Notas"** de su portal. Los boletines se generan al cierre de cada trimestre. Mínimo aprobatorio: **65 puntos**.'},
  ausencias:{k:['asistencia','ausente','lista','tomar asistencia'],    r:'📅 Registre ausencias en la sección **"Ausencias"** del portal. El sistema notifica automáticamente al padre/tutor cuando se registra una inasistencia.'},
  evaluacion:{k:['evaluacion','minimo','reprobar','aprobar','promedio'],r:'📊 Según ordenanzas MINERD: nota mínima aprobatoria **65**. 70-79 → recuperación. Los reportes son trimestrales. Cuadro de Honor: **90+**.'},
  inafocam:{k:['inafocam','formacion','capacitacion','taller'],        r:'🎓 El **INAFOCAM** ofrece formación continua gratuita para docentes. Cursos presenciales y virtuales. Inscripción en: inafocam.edu.do'},
  calendario:{k:['calendario','inicio','vacaciones','año escolar'],    r:'📅 Año escolar 2025-2026: inició el **26 de agosto de 2025**. Vacaciones navideñas: 20 dic – 6 ene. Semana Santa según calendario oficial MINERD.'},
  minerd:  {k:['minerd','ministerio','circular','comunicado','normativa'], r:'📰 Para circulares y comunicados oficiales visite: **minerd.gob.do** o llame al **(809) 682-0535**. También en redes sociales @MINERD_RD.'},
  distrito:{k:['distrito','regional','supervision'],                   r:'🏛️ El centro pertenece al **Distrito Educativo 10-02** de Santo Domingo Norte. Gestiones oficiales se canalizan a través del Distrito.'},
};

var KB_ADMIN = {
  ley66:    {k:['ley 66','ley general','66-97'],                      r:'📖 La **Ley General de Educación 66-97** rige el sistema educativo dominicano. Define los derechos educativos, estructura de niveles y obligaciones del Estado. Texto en: minerd.gob.do'},
  carrera:  {k:['ley 41','carrera docente','escalafon','estatuto'],   r:'👨‍🏫 La **Ley 41-00 de Carrera Docente** regula contratación, escalafón y derechos de los maestros. Los directores deben cumplirla en toda decisión de personal.'},
  reglamento:{k:['reglamento','norma','reglamento interno','convivencia'],r:'📋 Los centros deben tener un **Reglamento Interno** aprobado por el Distrito Educativo. Debe actualizarse según las ordenanzas vigentes del MINERD.'},
  minerd:   {k:['minerd','ministerio','noticia','circular','comunicado'],r:'📰 Últimas circulares y noticias del MINERD en: **minerd.gob.do**. Para asuntos urgentes: **(809) 682-0535**. Siga @MINERD_RD en redes sociales.'},
  calendario:{k:['calendario','año escolar','inicio','vacaciones'],    r:'📅 Año escolar 2025-2026 inició el **26 de agosto de 2025**. Cierre del primer trimestre: noviembre 2025. Vacaciones: 20 dic – 6 ene. Semana Santa: según decreto oficial.'},
  evaluacion:{k:['evaluacion','nota','calificacion','aprobacion','reprobacion'],r:'📊 Ordenanza MINERD: mínimo aprobatorio **65**. Recuperación: 70-79. Boletines trimestrales. Los centros deben garantizar el proceso evaluativo sin interrupciones.'},
  jornada:  {k:['jornada','horario','extendida','tanda','tandas'],     r:'⏰ Los centros de jornada extendida operan **8 horas diarias**. Los de tanda regular: **4 horas**. La extensión de jornada requiere autorización del MINERD y habilitación de infraestructura.'},
  beca:     {k:['beca','superate','apoyo','estudiante destacado'],     r:'🎓 El programa **Supérate** beneficia a estudiantes con promedio ≥80 y condición económica vulnerable. Inscriba candidatos a través del Distrito Educativo 10-02.'},
  supervision:{k:['supervision','inspector','visita','auditoria'],     r:'🔍 Los centros están sujetos a supervisión del Distrito y la Regional. Mantenga al día: nóminas, actas, expedientes, plan operativo y reglamento interno.'},
  estadisticas:{k:['estadistica','datos','matricula','poblacion'],     r:'📊 El MINERD publica estadísticas educativas anuales en: **estadisticas.minerd.gob.do**. Los directores deben reportar matrícula al inicio de año y al cierre de trimestre.'},
  contacto: {k:['contacto','telefono','correo','email','direccion'],   r:'📍 C.E. Otilia Peláez · **Av. Charles de Gaulle, Sabana Perdida, SDN**. 📞 **(809) 590-0771**. 📧 otiliapelaezadm@gmail.com. MINERD central: **(809) 682-0535**.'},
};

var FAB_CFG = {
  padre: {emoji:'👪', nombre:'Asistente de Padres',  kb:KB_PADRE, qr:['📋 Notas del hijo/a','📅 Justificar ausencia','⏰ Horario escolar','📢 Anuncios','📍 Contacto']},
  profe: {emoji:'📚', nombre:'Asistente Docente',     kb:KB_PROFE, qr:['📋 Leyes educativas','📄 Circulares MINERD','📅 Calendario escolar','📝 Planificación','❓ Otra consulta']},
  admin: {emoji:'🏛️', nombre:'Asistente Administrativo', kb:KB_ADMIN, qr:['📰 Noticias MINERD','⚖️ Leyes educativas','📄 Circulares','📊 Estadísticas','🏫 Normativa']},
};

var fabOpen = {padre:false, profe:false, admin:false};
var fabHistory = {padre:[], profe:[], admin:[]};

function showBotFab(role, show){
  var el = document.getElementById('bot-fab-'+role);
  if(!el) return;
  el.style.display = show ? 'flex' : 'none';
  if(show && fabHistory[role].length===0) fabWelcome(role);
}

function showAllBotFabs(show){
  ['padre','profe','admin'].forEach(function(r){ showBotFab(r, show); });
}

function toggleRoleFab(role){
  var pfx = FAB_PFX[role];
  var win = document.getElementById(pfx+'-window');
  if(!win) return;
  fabOpen[role] = !fabOpen[role];
  win.style.display = fabOpen[role] ? 'flex' : 'none';
  // clear badge
  var badge = document.getElementById(pfx+'-badge');
  if(badge) badge.style.display='none';
  if(fabOpen[role] && fabHistory[role].length===0) fabWelcome(role);
  if(fabOpen[role]) setTimeout(function(){
    var msgs=document.getElementById(pfx+'-msgs');
    if(msgs)msgs.scrollTop=msgs.scrollHeight;
  },50);
}

function fabWelcome(role){
  var cfg = FAB_CFG[role];
  var nombre = APP.currentUser ? APP.currentUser.name.split(' ')[0] : '';
  var welcomeMap = {
    padre:  '¡Hola, '+nombre+'! 👪 Soy tu asistente de padres. Puedo orientarte sobre notas, ausencias, horarios, reglamento y más.',
    profe:  '¡Bienvenido/a, '+nombre+'! 📚 Soy tu asistente docente. Consulta leyes educativas, circulares del MINERD, planificación y normativas.',
    admin:  '¡Hola, '+nombre+'! 🏛️ Soy tu asistente administrativo. Consulta noticias del MINERD, leyes, normativas y estadísticas educativas.',
  };
  fabAddMsg(role, 'bot', welcomeMap[role]);
  fabRenderQR(role, cfg.qr);
}

function fabAddMsg(role, from, text){
  var pfx = FAB_PFX[role];
  var time = new Date().toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'});
  fabHistory[role].push({from:from,text:text,time:time});
  var el = document.getElementById(pfx+'-msgs'); if(!el) return;
  var txt = text.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
  var colors = {padre:'#1a3a5c', profe:'#0d2a1f', admin:'#1a2a50'};
  var emojis = {padre:'👪', profe:'📚', admin:'🏛️'};
  var html = from==='bot'
    ? '<div style="display:flex;gap:8px;align-items:flex-end;"><div style="width:28px;height:28px;background:#d4af37;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">'+emojis[role]+'</div><div style="background:#f0f4ff;border-radius:14px 14px 14px 2px;padding:10px 13px;max-width:82%;"><p style="margin:0;font-size:13px;line-height:1.5;color:#1a2a50;">'+txt+'</p><span style="font-size:10px;color:#aaa;">'+time+'</span></div></div>'
    : '<div style="display:flex;justify-content:flex-end;"><div style="background:'+colors[role]+';border-radius:14px 14px 2px 14px;padding:10px 13px;max-width:82%;"><p style="margin:0;font-size:13px;color:white;line-height:1.5;">'+txt+'</p><span style="font-size:10px;color:rgba(255,255,255,0.6);">'+time+'</span></div></div>';
  el.innerHTML += html;
  el.scrollTop = el.scrollHeight;
  if(!APP._botStats)APP._botStats={totalMsgs:0,unicos:0,resueltos:0,sinRespuesta:0,freq:{}};
  if(from==='user') APP._botStats.totalMsgs++;
}

function fabRenderQR(role, replies){
  var pfx = FAB_PFX[role];
  var el = document.getElementById(pfx+'-qr'); if(!el) return;
  el.innerHTML = (replies||[]).map(function(q){
    return '<button onclick="fabQuickReply(\''+role+'\',\''+q.replace(/'/g,"\\'")+'\')" style="background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);color:white;border-radius:20px;padding:5px 11px;font-size:12px;cursor:pointer;font-family:\'Nunito\',sans-serif;white-space:nowrap;">'+q+'</button>';
  }).join('');
}

function fabQuickReply(role, text){
  fabAddMsg(role,'user',text);
  fabRenderQR(role,[]);
  setTimeout(function(){fabProcess(role,text);}, APP.botConfig&&APP.botConfig.delay||600);
}

function roleFabSend(role){
  var pfx = FAB_PFX[role];
  var inp = document.getElementById(pfx+'-inp');
  var msg = inp&&inp.value.trim(); if(!msg) return;
  if(inp) inp.value='';
  fabAddMsg(role,'user',msg);
  fabRenderQR(role,[]);
  setTimeout(function(){fabProcess(role,msg);}, APP.botConfig&&APP.botConfig.delay||600);
}

function fabProcess(role, msg){
  var lower = msg.toLowerCase();
  var cfg = FAB_CFG[role];

  // Blocked words check
  var bc = APP.botConfig;
  if(bc&&bc.blockedWords){
    var blocked = bc.blockedWords.split(',').map(function(w){return w.trim().toLowerCase();}).filter(Boolean);
    if(blocked.some(function(w){return lower.indexOf(w)!==-1;})){
      fabAddMsg(role,'bot', bc.blockedMsg||'Lo siento, no puedo responder sobre ese tema.');
      return;
    }
  }

  // Search KB
  var kb = cfg.kb;
  var found = Object.keys(kb).some(function(key){
    var entry = kb[key];
    if(entry.k.some(function(kw){return lower.indexOf(kw)!==-1;})){
      fabAddMsg(role,'bot',entry.r);
      fabRenderQR(role,['👍 Entendido','¿Algo más?','📍 Contacto del centro']);
      if(!APP._botStats)APP._botStats={totalMsgs:0,unicos:0,resueltos:0,sinRespuesta:0,freq:{}};
      APP._botStats.resueltos++;
      APP._botStats.freq[msg.substring(0,40)] = (APP._botStats.freq[msg.substring(0,40)]||0)+1;
      return true;
    }
    return false;
  });
  if(found) return;

  // Saludos
  if(['hola','buenos','buenas','hey','buen'].some(function(s){return lower.indexOf(s)!==-1;})){
    fabAddMsg(role,'bot','😊 ¡Hola! Estoy aquí para ayudarte. Puedo responder sobre:');
    fabRenderQR(role, cfg.qr);
    return;
  }
  // Agradecimientos
  if(['gracias','perfecto','excelente','ok','entendido'].some(function(s){return lower.indexOf(s)!==-1;})){
    fabAddMsg(role,'bot','¡Con gusto! 😊 Si necesitas más ayuda, aquí estaré.');
    fabRenderQR(role,['¿Algo más?','📍 Contacto del centro']);
    return;
  }
  // Cierre
  if(['adios','bye','cerrar','hasta'].some(function(s){return lower.indexOf(s)!==-1;})){
    fabAddMsg(role,'bot','¡Hasta luego! 👋 Que tengas un excelente día.');
    setTimeout(function(){
      fabOpen[role]=false;
      var pfx=FAB_PFX[role];
      var win=document.getElementById(pfx+'-window');
      if(win)win.style.display='none';
    },1400);
    return;
  }
  // Fallback
  fabAddMsg(role,'bot','No tengo información exacta sobre eso 🤔 Te recomiendo consultar al **MINERD** en minerd.gob.do o llamar al **(809) 682-0535**. ¿Puedo ayudarte con otra consulta?');
  fabRenderQR(role,['📍 Contacto del centro','❓ Otra consulta']);
  if(!APP._botStats)APP._botStats={totalMsgs:0,unicos:0,resueltos:0,sinRespuesta:0,freq:{}};
  APP._botStats.sinRespuesta++;
}

// Admin bot FAB handled via showBotFab('admin',true) on login

// ---- CONFIG LOGIN / REGISTRO ----
if(!APP.loginDesign)APP.loginDesign={
  title:'Centro Educativo Otilia Peláez',
  subtitle:'Sistema de Gestión Educativa · Sabana Perdida, SDN',
  btnText:'Iniciar Sesión →',
  regText:'📝 Registrarse (Padre / Estudiante)',
  bgColor:'#f5f0e8', cardColor:'#ffffff',
  btnColor:'#d4af37', btnTxt:'#16213e',
  welcome:'', bgImage:null
};
if(!APP.registroDesign)APP.registroDesign={
  title:'📝 Crear Cuenta',
  btnText:'✅ Crear Cuenta',
  showTel:true, showCarrera:true, showVinculo:true, showPassConfirm:true,
  successMsg:'¡Cuenta creada! Ya puedes iniciar sesión.',
  terms:''
};

function applyCfgLogin(){
  var d=APP.loginDesign;
  d.title=document.getElementById('cfg-login-title').value||d.title;
  d.subtitle=document.getElementById('cfg-login-subtitle').value||d.subtitle;
  d.btnText=document.getElementById('cfg-login-btn-text').value||d.btnText;
  d.regText=document.getElementById('cfg-login-reg-text').value||d.regText;
  d.bgColor=document.getElementById('cfg-login-bg').value;
  d.cardColor=document.getElementById('cfg-login-card').value;
  d.btnColor=document.getElementById('cfg-login-btn-color').value;
  d.btnTxt=document.getElementById('cfg-login-btn-txt').value;
  d.welcome=document.getElementById('cfg-login-welcome').value;
  var ls=document.getElementById('login-screen');
  if(ls)ls.style.background=d.bgColor;
  var card=ls&&ls.querySelector('.login-card');if(card)card.style.background=d.cardColor;
  var loginBtn=document.querySelector('#login-screen .btn-gold');
  if(loginBtn){loginBtn.style.background=d.btnColor;loginBtn.style.color=d.btnTxt;loginBtn.textContent=d.btnText;}
  var h2=document.querySelector('#login-screen h2');if(h2)h2.textContent=d.title;
  if(d.bgImage){ls.style.backgroundImage='url('+d.bgImage+')';ls.style.backgroundSize='cover';}
  var pt=document.getElementById('prev-login-title');if(pt)pt.textContent=d.title;
  var ps=document.getElementById('prev-login-sub');if(ps)ps.textContent=d.subtitle;
  var pb=document.getElementById('prev-login-btn');if(pb){pb.style.background=d.btnColor;pb.style.color=d.btnTxt;pb.textContent=d.btnText;}
  var pbox=document.getElementById('cfg-login-preview');if(pbox)pbox.style.background=d.bgColor;
  logAudit('config','Diseño de login actualizado');
  toast('✅ Login actualizado','success');
  persistSave();
}

function previewLoginBg(e){
  var file=e.target.files[0];if(!file)return;
  var r=new FileReader();r.onload=function(ev){
    APP.loginDesign.bgImage=ev.target.result;
    var prev=document.getElementById('cfg-login-bg-preview');
    var ph=document.getElementById('cfg-login-bg-ph');
    if(prev){prev.src=ev.target.result;prev.style.display='block';}
    if(ph)ph.style.display='none';
  };r.readAsDataURL(file);
}

function resetCfgLogin(){
  APP.loginDesign={title:'Centro Educativo Otilia Peláez',subtitle:'Sistema de Gestión Educativa · Sabana Perdida, SDN',btnText:'Iniciar Sesión →',regText:'📝 Registrarse (Padre / Estudiante)',bgColor:'#f5f0e8',cardColor:'#ffffff',btnColor:'#d4af37',btnTxt:'#16213e',welcome:'',bgImage:null};
  ['cfg-login-title','cfg-login-subtitle','cfg-login-btn-text','cfg-login-reg-text'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.value=APP.loginDesign[id.replace('cfg-login-','').replace(/-([a-z])/g,function(m,c){return c.toUpperCase();})];
  });
  toast('Login restablecido','info');
}

function applyCfgRegistro(){
  var d=APP.registroDesign;
  d.title=document.getElementById('cfg-reg-title').value||d.title;
  d.btnText=document.getElementById('cfg-reg-btn-text').value||d.btnText;
  d.showTel=document.getElementById('cfg-reg-show-tel').checked;
  d.showCarrera=document.getElementById('cfg-reg-show-carrera').checked;
  d.showVinculo=document.getElementById('cfg-reg-show-vinculo').checked;
  d.showPassConfirm=document.getElementById('cfg-reg-show-passconfirm').checked;
  d.successMsg=document.getElementById('cfg-reg-success-msg').value||d.successMsg;
  d.terms=document.getElementById('cfg-reg-terms').value;
  var rh=document.querySelector('#register-form-wrap h3');if(rh)rh.textContent=d.title;
  var rb=document.querySelector('#register-form-wrap .btn-gold');if(rb)rb.textContent=d.btnText;
  var carWrap=document.getElementById('reg-carrera-wrap');if(carWrap)carWrap.style.display=d.showCarrera?'block':'none';
  var pcWrap=document.getElementById('reg-madre-wrap');if(pcWrap)pcWrap.style.display=d.showPassConfirm?'block':'none';
  logAudit('config','Diseño de registro actualizado');
  toast('✅ Registro actualizado','success');
  persistSave();
}

// ================================================
//   REGLAMENTO — Admin gestión + Vista todos roles
// ================================================

if(!APP.reglamento) APP.reglamento = {
  visible: true,
  visEst: true, visPadre: true, visProfe: true,
  titulo: 'Reglamento Interno del Centro Educativo Otilia Peláez',
  anio: '2025-2026',
  intro: 'El presente reglamento establece las normas de convivencia, derechos y deberes de todos los miembros de la comunidad educativa del Centro Educativo Otilia Peláez, conforme a la Ley General de Educación 66-97.',
  secciones: [
    {
      id: 's1', titulo: '📌 Capítulo I — Disposiciones Generales', visible: true,
      contenido: 'Art. 1 — El Centro Educativo Otilia Peláez es una institución de carácter privado, regida por la Ley General de Educación 66-97 y las ordenanzas del Ministerio de Educación (MINERD).\n\nArt. 2 — La misión del centro es brindar una educación integral, inclusiva y de calidad, basada en valores cristianos y principios de excelencia académica.\n\nArt. 3 — Este reglamento aplica a todos los miembros de la comunidad educativa: estudiantes, padres, maestros y personal administrativo.'
    },
    {
      id: 's2', titulo: '🎓 Capítulo II — Derechos y Deberes del Estudiante', visible: true,
      contenido: 'Art. 4 — Derechos: Recibir educación de calidad. Ser tratado con respeto y dignidad. Conocer sus calificaciones en tiempo oportuno. Participar en actividades académicas y culturales.\n\nArt. 5 — Deberes: Asistir puntualmente a clases. Usar el uniforme oficial en todo momento. Respetar a maestros, compañeros y personal. Mantener orden y disciplina dentro del plantel.\n\nArt. 6 — Queda prohibido el uso de teléfonos celulares durante el horario de clases sin autorización expresa del maestro.'
    },
    {
      id: 's3', titulo: '👪 Capítulo III — Derechos y Deberes de los Padres', visible: true,
      contenido: 'Art. 7 — Los padres tienen derecho a: Ser informados del progreso académico de su hijo/a. Participar en la APMAE. Solicitar reuniones con maestros y dirección.\n\nArt. 8 — Los padres tienen el deber de: Garantizar la asistencia regular de su hijo/a. Justificar ausencias dentro de los 3 días hábiles siguientes. Colaborar con el proceso educativo desde el hogar.'
    },
    {
      id: 's4', titulo: '👨‍🏫 Capítulo IV — Deberes del Personal Docente', visible: true,
      contenido: 'Art. 9 — El personal docente debe cumplir con el horario establecido, planificar clases según el currículo vigente, registrar asistencia y notas puntualmente, y mantener una comunicación respetuosa con padres y estudiantes.\n\nArt. 10 — Los maestros deben reportar cualquier situación irregular al director del centro en un plazo no mayor de 24 horas.'
    },
    {
      id: 's5', titulo: '⚠️ Capítulo V — Faltas y Sanciones', visible: true,
      contenido: 'Art. 11 — Las faltas se clasifican en: Leves (tardanzas, uniforme incompleto), Graves (irrespeto a autoridades, daño a la propiedad) y Muy graves (agresión física, sustancias prohibidas).\n\nArt. 12 — Las sanciones incluyen: Amonestación verbal, citación de padres, suspensión temporal y en casos extremos, expulsión con notificación al Distrito Educativo.\n\nArt. 13 — Todo proceso disciplinario garantizará el derecho a la defensa del estudiante, conforme a la Ley 136-03.'
    },
    {
      id: 's6', titulo: '📊 Capítulo VI — Evaluación y Calificaciones', visible: true,
      contenido: 'Art. 14 — El sistema de evaluación sigue las ordenanzas del MINERD. La nota mínima aprobatoria es 65 puntos sobre 100.\n\nArt. 15 — Las calificaciones se publican al cierre de cada trimestre. Los padres tienen derecho a solicitar aclaraciones en un plazo de 5 días hábiles.\n\nArt. 16 — Estudiantes con más del 20% de inasistencias injustificadas podrán ser reprobados por asistencia según normativa vigente.'
    },
  ]
};

// ---- Init admin panel ----
function initReglamentoAdmin(){
  var r = APP.reglamento;
  setVal('reg-titulo', r.titulo);
  setVal('reg-anio', r.anio);
  setVal('reg-intro', r.intro);
  setChk('reg-vis-est', r.visEst);
  setChk('reg-vis-padre', r.visPadre);
  setChk('reg-vis-profe', r.visProfe);
  renderRegSeccionesEditor();
  updateRegStatus();
  applyReglamentoTabs();
}
function setVal(id,v){var e=document.getElementById(id);if(e)e.value=v||'';}
function setChk(id,v){var e=document.getElementById(id);if(e)e.checked=!!v;}

function updateRegStatus(){
  var r=APP.reglamento;
  r.visEst=document.getElementById('reg-vis-est')&&document.getElementById('reg-vis-est').checked;
  r.visPadre=document.getElementById('reg-vis-padre')&&document.getElementById('reg-vis-padre').checked;
  r.visProfe=document.getElementById('reg-vis-profe')&&document.getElementById('reg-vis-profe').checked;
  var anyOn = r.visible&&(r.visEst||r.visPadre||r.visProfe);
  var bar=document.getElementById('reg-status-bar');
  var dot=document.getElementById('reg-status-dot');
  var txt=document.getElementById('reg-status-txt');
  var who=[];
  if(r.visEst)who.push('Estudiantes');
  if(r.visPadre)who.push('Padres');
  if(r.visProfe)who.push('Maestros');
  if(!r.visible||who.length===0){
    if(bar)bar.style.cssText='display:flex;align-items:center;gap:10px;background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:10px 14px;margin-bottom:18px;';
    if(dot)dot.style.background='#ef4444';
    if(txt){txt.style.color='#b91c1c';txt.textContent='Reglamento OCULTO — no visible en ningún portal';}
  } else {
    if(bar)bar.style.cssText='display:flex;align-items:center;gap:10px;background:#f0fff4;border:1px solid #86efac;border-radius:10px;padding:10px 14px;margin-bottom:18px;';
    if(dot)dot.style.background='#22c55e';
    if(txt){txt.style.color='#15803d';txt.textContent='Reglamento visible para: '+who.join(', ');}
  }
  var btn=document.getElementById('reg-toggle-btn');
  if(btn)btn.textContent=r.visible?'🚫 Ocultar todo':'👁 Mostrar todo';
  applyReglamentoTabs();
}

function toggleReglamentoVisibility(){
  APP.reglamento.visible=!APP.reglamento.visible;
  updateRegStatus();
  toast(APP.reglamento.visible?'Reglamento publicado':'Reglamento ocultado','info');
}

function applyReglamentoTabs(){
  var r=APP.reglamento;
  // Show/hide tab for each role
  var estTab=document.getElementById('est-reg-tab');
  var padreTab=document.getElementById('padre-reg-tab');
  var profeTab=document.getElementById('profe-reg-tab');
  if(estTab)estTab.style.display=(r.visible&&r.visEst)?'':'none';
  if(padreTab)padreTab.style.display=(r.visible&&r.visPadre)?'':'none';
  if(profeTab)profeTab.style.display=(r.visible&&r.visProfe)?'':'none';
}

// ---- Render sections editor ----
function renderRegSeccionesEditor(){
  var r=APP.reglamento;
  var el=document.getElementById('reg-secciones-editor');if(!el)return;
  el.innerHTML=r.secciones.map(function(s,i){
    return '<div class="bot-resp-row" style="margin-top:12px;" id="reg-sec-'+s.id+'">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
      +'<input type="text" value="'+escHtml(s.titulo)+'" id="rs-title-'+s.id+'" style="flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-weight:700;font-family:\'Nunito\',sans-serif;">'
      +'<label class="bot-toggle" title="Visible"><input type="checkbox" id="rs-vis-'+s.id+'" '+(s.visible?'checked':'')+'><span class="bot-toggle-slider"></span></label>'
      +'<button onclick="deleteRegSeccion(\''+s.id+'\')" style="background:none;border:none;color:#ef4444;font-size:16px;cursor:pointer;flex-shrink:0;">🗑</button>'
      +'</div>'
      +'<textarea id="rs-body-'+s.id+'" rows="5" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:\'Nunito\',sans-serif;resize:vertical;line-height:1.6;">'+escHtml(s.contenido)+'</textarea>'
      +'</div>';
  }).join('');
}

function addRegSeccion(){
  var id='s'+Date.now();
  APP.reglamento.secciones.push({id:id,titulo:'📌 Nueva Sección',visible:true,contenido:'Escribe aquí el contenido de esta sección...'});
  renderRegSeccionesEditor();
  // scroll to new
  setTimeout(function(){var el=document.getElementById('reg-sec-'+id);if(el)el.scrollIntoView({behavior:'smooth'});},100);
}

function deleteRegSeccion(id){
  if(!confirm('¿Eliminar esta sección?'))return;
  APP.reglamento.secciones=APP.reglamento.secciones.filter(function(s){return s.id!==id;});
  renderRegSeccionesEditor();
}

function saveReglamento(){
  var r=APP.reglamento;
  r.titulo=document.getElementById('reg-titulo').value||r.titulo;
  r.anio=document.getElementById('reg-anio').value||r.anio;
  r.intro=document.getElementById('reg-intro').value||r.intro;
  r.visEst=document.getElementById('reg-vis-est').checked;
  r.visPadre=document.getElementById('reg-vis-padre').checked;
  r.visProfe=document.getElementById('reg-vis-profe').checked;
  // Read sections from DOM
  r.secciones.forEach(function(s){
    var tEl=document.getElementById('rs-title-'+s.id);
    var bEl=document.getElementById('rs-body-'+s.id);
    var vEl=document.getElementById('rs-vis-'+s.id);
    if(tEl)s.titulo=tEl.value;
    if(bEl)s.contenido=bEl.value;
    if(vEl)s.visible=vEl.checked;
  });
  r.visible=true;
  updateRegStatus();
  applyReglamentoTabs();
  logAudit('config','Reglamento actualizado y publicado');
  toast('✅ Reglamento guardado y publicado','success');
  persistSave();
}

function clearReglamento(){
  if(!confirm('¿Limpiar todo el contenido del reglamento?'))return;
  APP.reglamento.secciones=[];
  document.getElementById('reg-intro').value='';
  renderRegSeccionesEditor();
  toast('Contenido del reglamento limpiado','info');
}

function showRegTab(id,btn){
  ['reg-editor','reg-preview','reg-secciones'].forEach(function(t){
    var e=document.getElementById(t);if(e)e.style.display='none';
  });
  var el=document.getElementById(id);if(el)el.style.display='block';
  document.querySelectorAll('#dash-reglamento-admin .cfg-tab').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');
}

function previewReglamento(){
  var r=APP.reglamento;
  var el=document.getElementById('reg-preview-content');if(!el)return;
  el.innerHTML=buildReglamentoHTML(r,true);
}

// ---- Render for viewer portals ----
function renderReglamento(containerId){
  var el=document.getElementById(containerId);if(!el)return;
  var r=APP.reglamento;
  if(!r||!r.visible){
    el.innerHTML='<div style="text-align:center;padding:40px;color:#888;"><p style="font-size:40px;">📄</p><p>El reglamento no está disponible en este momento.</p></div>';
    return;
  }
  el.innerHTML=buildReglamentoHTML(r,false);
}

function buildReglamentoHTML(r,isPreview){
  var visibleSecs=r.secciones.filter(function(s){return s.visible;});
  var secHtml=visibleSecs.map(function(s,i){
    var bodyLines=s.contenido.split('\n').map(function(l){
      if(!l.trim())return '';
      var isArt=l.trim().match(/^Art\./i);
      return isArt
        ?'<p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#334155;"><strong style="color:var(--navy);">'+escHtml(l.trim().split('—')[0])+'</strong>'+(l.indexOf('—')>-1?(' — '+escHtml(l.trim().split('—').slice(1).join('—'))):'')+'</p>'
        :'<p style="margin:0 0 8px;font-size:13px;line-height:1.7;color:#475569;">'+escHtml(l.trim())+'</p>';
    }).join('');
    return '<div style="margin-bottom:22px;border-left:3px solid var(--gold);padding-left:16px;">'
      +'<h4 style="margin:0 0 10px;color:var(--navy);font-size:15px;">'+escHtml(s.titulo)+'</h4>'
      +bodyLines+'</div>';
  }).join('');

  return '<div style="font-family:\'Nunito\',sans-serif;">'
    +'<div style="text-align:center;padding:20px 0 24px;border-bottom:2px solid var(--border);margin-bottom:24px;">'
    +'<div style="font-size:40px;margin-bottom:8px;">📜</div>'
    +'<h2 style="margin:0 0 6px;color:var(--navy);font-size:18px;">'+escHtml(r.titulo)+'</h2>'
    +'<p style="color:#888;font-size:13px;margin:0;">Año Escolar '+escHtml(r.anio||'')+(isPreview?' · VISTA PREVIA':'')+'</p>'
    +'</div>'
    +(r.intro?'<div style="background:#f5f0e8;border-radius:12px;padding:16px;margin-bottom:24px;font-size:14px;line-height:1.7;color:#555;">'+escHtml(r.intro)+'</div>':'')
    +secHtml
    +'<p style="text-align:center;font-size:12px;color:#aaa;margin-top:28px;border-top:1px solid var(--border);padding-top:14px;">Centro Educativo Otilia Peláez · Sabana Perdida, SDN · Av. Charles de Gaulle</p>'
    +'</div>';
}

// Apply tabs on page load (in case session restores)
applyReglamentoTabs();

// ================================================
//   GESTIÓN DE CATEGORÍAS — Admin
// ================================================

if(!APP.categoriasConfig) APP.categoriasConfig = {
  sitio: [
    { id:'hero',          icon:'🖼',  title:'Sección Hero / Portada',    desc:'Imagen, título y botones de la pantalla de inicio.', active:true,
      fields:[{label:'Título principal',id:'cfg-hero-title'},{label:'Subtítulo',id:'cfg-hero-subtitle-gold'},{label:'Descripción',id:'cfg-hero-desc'}] },
    { id:'mision',        icon:'🎯',  title:'Misión, Visión y Valores',   desc:'Tarjetas de misión, visión y valores del centro.', active:true,
      fields:[{label:'Texto Misión',id:'cfg-mision-txt'},{label:'Texto Visión',id:'cfg-vision-txt'},{label:'Valores',id:'cfg-valores-txt'}] },
    { id:'niveles',       icon:'📚',  title:'Oferta Académica',           desc:'Sección con los niveles y bachilleratos ofrecidos.', active:true, fields:[] },
    { id:'instalaciones', icon:'🏗',  title:'Instalaciones del Centro',   desc:'Aulas, biblioteca, cancha, comedor, etc.', active:true, fields:[] },
    { id:'testimonios',   icon:'💬',  title:'Testimonios de Familias',    desc:'Comentarios de padres y estudiantes en la web.', active:true, fields:[] },
    { id:'maestros-page', icon:'👨‍🏫', title:'Página de Maestros',         desc:'Presentación del equipo docente en el sitio.', active:true, fields:[] },
    { id:'calendario-web',icon:'📅',  title:'Calendario Escolar',         desc:'Fechas importantes visibles en el sitio.', active:true, fields:[] },
    { id:'footer-redes',  icon:'🔗',  title:'Footer y Redes Sociales',    desc:'Facebook, WhatsApp, Instagram y copyright.', active:true,
      fields:[{label:'Texto copyright',id:'cfg-footer-copy'},{label:'WhatsApp',id:'cfg-whatsapp'},{label:'Facebook',id:'cfg-facebook'}] },
    { id:'mapa-web',      icon:'📍',  title:'Mapa / Ubicación',           desc:'Mapa de Google Maps en la página de contacto.', active:true, fields:[{label:'URL Google Maps',id:'cfg-maps'}] },
    { id:'galeria-web',   icon:'🖼️', title:'Galería de Fotos',           desc:'Sección de galería en el sitio público.', active:true, fields:[] },
  ],
  estudiante: [
    { id:'est-notas',     icon:'📋',  title:'Mis Notas',                  desc:'Pestaña de calificaciones por materia y período.', active:true, fields:[] },
    { id:'est-horario',   icon:'🗓',  title:'Horario',                    desc:'Horario de clases del estudiante.', active:true, fields:[] },
    { id:'est-tareas',    icon:'📌',  title:'Tareas',                     desc:'Lista de tareas y asignaciones pendientes.', active:true, fields:[] },
    { id:'est-anuncios',  icon:'📢',  title:'Anuncios',                   desc:'Comunicados del centro para estudiantes.', active:true, fields:[] },
    { id:'est-logros',    icon:'🏆',  title:'Logros y Reconocimientos',   desc:'Cuadro de honor, méritos y distinciones.', active:true, fields:[] },
    { id:'est-perfil',    icon:'👤',  title:'Mi Perfil',                  desc:'Datos personales y foto del estudiante.', active:true, fields:[] },
    { id:'est-reglamento',icon:'📜',  title:'Reglamento',                 desc:'Acceso al reglamento del centro.', active:true, fields:[] },
  ],
  padre: [
    { id:'padre-inicio',  icon:'🏠',  title:'Inicio / Panel',             desc:'Panel principal con resumen del hijo/a.', active:true, fields:[] },
    { id:'padre-notas',   icon:'📋',  title:'Notas del Hijo/a',           desc:'Calificaciones del estudiante vinculado.', active:true, fields:[] },
    { id:'padre-excusas', icon:'📅',  title:'Excusas y Ausencias',        desc:'Solicitud y gestión de justificaciones.', active:true, fields:[] },
    { id:'padre-horario', icon:'📆',  title:'Horario',                    desc:'Horario escolar del hijo/a.', active:true, fields:[] },
    { id:'padre-anuncios',icon:'📢',  title:'Anuncios',                   desc:'Comunicados del centro para padres.', active:true, fields:[] },
    { id:'padre-inscripciones',icon:'📝',title:'Inscripciones',           desc:'Proceso de inscripción en línea.', active:true, fields:[] },
    { id:'padre-mensajes',icon:'💬',  title:'Mensajes',                   desc:'Comunicación con maestros y la dirección.', active:true, fields:[] },
    { id:'padre-perfil',  icon:'👤',  title:'Mi Perfil',                  desc:'Datos del padre/tutor registrado.', active:true, fields:[] },
    { id:'padre-reglamento',icon:'📜',title:'Reglamento',                 desc:'Acceso al reglamento del centro.', active:true, fields:[] },
  ],
  profe: [
    { id:'profe-notas',   icon:'📋',  title:'Gestión de Notas',           desc:'Registro y edición de calificaciones.', active:true, fields:[] },
    { id:'profe-records', icon:'📂',  title:'Récords Estudiantiles',      desc:'Historial académico de los estudiantes.', active:true, fields:[] },
    { id:'profe-ausencias',icon:'📅', title:'Control de Ausencias',       desc:'Registro de asistencia por clase.', active:true, fields:[] },
    { id:'profe-mensajes',icon:'💬',  title:'Mensajes',                   desc:'Comunicación con padres y la dirección.', active:true, fields:[] },
    { id:'profe-anuncios',icon:'📢',  title:'Anuncios',                   desc:'Comunicados del centro para maestros.', active:true, fields:[] },
    { id:'profe-perfil',  icon:'👤',  title:'Mi Perfil',                  desc:'Datos profesionales del maestro.', active:true, fields:[] },
    { id:'profe-reglamento',icon:'📜',title:'Reglamento',                 desc:'Acceso al reglamento del centro.', active:true, fields:[] },
  ],
};

var _catEditingField = null;

function showCatTab(id, btn){
  document.querySelectorAll('.cat-tab-pane').forEach(function(p){p.style.display='none';});
  var el=document.getElementById(id); if(el) el.style.display='block';
  document.querySelectorAll('#cfg-categorias .cfg-tab').forEach(function(b){b.classList.remove('active');});
  if(btn) btn.classList.add('active');
}

function initCategoriasAdmin(){
  if(!APP.currentUser || APP.currentUser.role !== 'admin'){
    var el=document.getElementById('cfg-categorias');
    if(el) el.innerHTML='<div style="text-align:center;padding:40px;color:#ef4444;"><p style="font-size:32px;">🔒</p><p style="font-weight:700;">Solo el administrador puede acceder a esta sección.</p></div>';
    return;
  }
  var c = APP.categoriasConfig;
  renderCatList('cat-sitio-list',   c.sitio,       'sitio');
  renderCatList('cat-est-list',     c.estudiante,  'estudiante');
  renderCatList('cat-padre-list',   c.padre,       'padre');
  renderCatList('cat-profe-list',   c.profe,       'profe');
}

function renderCatList(containerId, cats, group){
  var el=document.getElementById(containerId); if(!el) return;
  el.innerHTML = cats.map(function(cat,i){
    var fieldsHtml = '';
    if(cat.fields && cat.fields.length>0){
      fieldsHtml = '<div style="margin-top:12px;">'
        +'<p style="font-size:12px;font-weight:700;color:var(--navy);margin:0 0 10px;">✏️ Contenido editable:</p>'
        +'<div style="display:flex;flex-direction:column;gap:8px;">'
        + cat.fields.map(function(f){
            var el2 = document.getElementById(f.id);
            var val = el2 ? el2.value : (f.value||'');
            var isTA = val && val.length > 80;
            return '<div class="form-group" style="margin:0;">'
              +'<label style="font-size:12px;">'+f.label+'</label>'
              +(isTA
                ? '<textarea id="catf-'+f.id+'" rows="3" style="font-size:12px;">'+escHtml(val)+'</textarea>'
                : '<input type="text" id="catf-'+f.id+'" value="'+escHtml(val)+'" style="font-size:12px;">'
              )
              +'</div>';
          }).join('')
        +'</div>'
        +'<button class="btn btn-gold" style="font-size:12px;margin-top:10px;padding:7px 14px;" onclick="applyCatFields(\''+group+'\','+i+')">✅ Aplicar cambios</button>'
        +'</div>';
    } else if(cat.active){
      fieldsHtml = '<p style="font-size:12px;color:#aaa;margin:8px 0 0;">Esta sección no tiene campos de texto editables aquí. Usa la pestaña dedicada en el menú de Configuración.</p>';
    }

    return '<div class="cat-card'+(cat._expanded?' expanded':'')+'" id="catcard-'+group+'-'+i+'">'
      +'<div class="cat-card-header" onclick="toggleCatCard(\''+group+'\','+i+')">'
        +'<span class="cat-card-icon">'+cat.icon+'</span>'
        +'<div class="cat-card-info">'
          +'<p class="cat-card-title">'+escHtml(cat.title)+'</p>'
          +'<p class="cat-card-desc">'+escHtml(cat.desc)+'</p>'
        +'</div>'
        +'<div class="cat-card-controls">'
          +'<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;'+(cat.active?'background:#dcfce7;color:#16a34a;':'background:#fee2e2;color:#b91c1c;')+'">'+( cat.active?'● Activo':'○ Inactivo')+'</span>'
          +'<label class="bot-toggle" onclick="event.stopPropagation()"><input type="checkbox" '+(cat.active?'checked':'')+' onchange="toggleCatActive(\''+group+'\','+i+',this.checked)"><span class="bot-toggle-slider"></span></label>'
          +'<button class="cat-expand-btn" onclick="event.stopPropagation();toggleCatCard(\''+group+'\','+i+')">▼</button>'
        +'</div>'
      +'</div>'
      +'<div class="cat-card-body">'
        +fieldsHtml
      +'</div>'
    +'</div>';
  }).join('');
}

function toggleCatCard(group, i){
  var cats = APP.categoriasConfig[group];
  cats[i]._expanded = !cats[i]._expanded;
  var card = document.getElementById('catcard-'+group+'-'+i);
  if(card){
    card.classList.toggle('expanded', cats[i]._expanded);
    var btn = card.querySelector('.cat-expand-btn');
    if(btn) btn.style.transform = cats[i]._expanded ? 'rotate(180deg)' : 'rotate(0deg)';
    var body = card.querySelector('.cat-card-body');
    if(body) body.style.display = cats[i]._expanded ? 'block' : 'none';
  }
}

function toggleCatActive(group, i, active){
  // SOLO el admin puede activar/desactivar categorías
  if(!APP.currentUser || APP.currentUser.role !== 'admin'){
    toast('Solo el administrador puede modificar las categorías.','error');
    // Revert the checkbox visually
    var card = document.getElementById('catcard-'+group+'-'+i);
    if(card){ var cb=card.querySelector('input[type=checkbox]'); if(cb) cb.checked=!active; }
    return;
  }
  APP.categoriasConfig[group][i].active = active;
  // Update status badge immediately
  var card = document.getElementById('catcard-'+group+'-'+i);
  if(card){
    var badge = card.querySelector('.cat-card-controls span');
    if(badge){
      badge.style.cssText = 'font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;'+(active?'background:#dcfce7;color:#16a34a;':'background:#fee2e2;color:#b91c1c;');
      badge.textContent = active ? '● Activo' : '○ Inactivo';
    }
  }
  applyCatVisibility(group, i, active);
}

function applyCatVisibility(group, i, active){
  var cat = APP.categoriasConfig[group][i];
  // Apply visibility to the actual DOM element
  var sectionEl = document.getElementById(cat.id);
  if(sectionEl) sectionEl.style.display = active ? '' : 'none';

  // For tabs, hide/show the tab button too
  if(group === 'estudiante'){
    document.querySelectorAll('.est-tab[data-est="'+cat.id+'"]').forEach(function(t){
      t.style.display = active ? '' : 'none';
    });
  } else if(group === 'padre'){
    // find tab by its onclick content matching the section id
    document.querySelectorAll('#page-padre .est-tab').forEach(function(t){
      if(t.getAttribute('onclick')&&t.getAttribute('onclick').indexOf(cat.id)>-1){
        t.style.display = active ? '' : 'none';
      }
    });
  } else if(group === 'profe'){
    document.querySelectorAll('#page-profesor .dash-tab').forEach(function(t){
      if(t.getAttribute('onclick')&&t.getAttribute('onclick').indexOf(cat.id)>-1){
        t.style.display = active ? '' : 'none';
      }
    });
  } else if(group === 'sitio'){
    // Public site sections by data attr or id
    var pub = document.querySelector('section[data-cat="'+cat.id+'"], #'+cat.id+'-section, .section-'+cat.id);
    if(pub) pub.style.display = active ? '' : 'none';
  }
}

function applyCatFields(group, i){
  var cat = APP.categoriasConfig[group][i];
  if(!cat.fields) return;
  cat.fields.forEach(function(f){
    var catInput = document.getElementById('catf-'+f.id);
    var realInput = document.getElementById(f.id);
    if(catInput && realInput){
      realInput.value = catInput.value;
      // Trigger live apply
      var ev = new Event('change');
      realInput.dispatchEvent(ev);
    }
  });
  toast('✅ Cambios aplicados en "'+cat.title+'"','success');
}

function saveCategoriasConfig(){
  if(!APP.currentUser || APP.currentUser.role !== 'admin'){
    toast('Solo el administrador puede guardar la configuración de categorías.','error');
    return;
  }
  // Re-read all field values into config
  var c = APP.categoriasConfig;
  ['sitio','estudiante','padre','profe'].forEach(function(group){
    c[group].forEach(function(cat, i){
      if(cat.fields) cat.fields.forEach(function(f){
        var inp = document.getElementById('catf-'+f.id);
        if(inp) f.value = inp.value;
      });
    });
  });
  // Apply all visibility states
  ['sitio','estudiante','padre','profe'].forEach(function(group){
    c[group].forEach(function(cat, i){
      applyCatVisibility(group, i, cat.active);
    });
  });
  logAudit('config','Categorías actualizadas');
  toast('✅ Configuración de categorías guardada','success');
  persistSave();
}

function resetCategoriasConfig(){
  if(!APP.currentUser || APP.currentUser.role !== 'admin'){
    toast('Solo el administrador puede restablecer las categorías.','error');
    return;
  }
  if(!confirm('¿Restablecer todas las categorías a sus valores por defecto?')) return;
  // Set all to active
  var c = APP.categoriasConfig;
  ['sitio','estudiante','padre','profe'].forEach(function(group){
    c[group].forEach(function(cat){ cat.active = true; });
  });
  initCategoriasAdmin();
  saveCategoriasConfig();
  toast('Categorías restablecidas','info');
  persistSave();
}

// ================================================
//   REHYDRATE UI — aplica config guardada al DOM
// ================================================
function applyAllSavedConfig(){
  try{
    var c;

    // ── Información general del centro ──
    if(APP.cfgInfo){
      var ci=APP.cfgInfo;
      if(ci.nombre) { var h=document.querySelector('.site-logo span,.navbar-brand'); if(h) h.textContent=ci.nombre; }
    }

    // ── Hero ──
    if(APP.cfgHero){
      var ch=APP.cfgHero;
      if(ch.title&&document.getElementById('cfg-hero-title')) document.getElementById('cfg-hero-title').value=ch.title;
      if(ch.desc&&document.getElementById('cfg-hero-desc')) document.getElementById('cfg-hero-desc').value=ch.desc;
    }

    // ── Bot config ──
    if(APP.botConfig){
      var bc=APP.botConfig;
      // Update chat bubble color
      var bubble=document.getElementById('chat-bubble');
      if(bubble&&bc.color) bubble.style.background=bc.color;
      // Update bot name in chat header
      var chatH=document.querySelector('#chat-window h4');
      if(chatH&&bc.nombre) chatH.textContent=bc.nombre;
      // Badge
      var badge=document.getElementById('chat-notif-badge');
      if(badge) badge.style.display=(bc.autoBadge&&APP.announcements&&APP.announcements.length>0)?'flex':'none';
      // Bot foto
      if(bc.foto){
        var av=document.getElementById('bot-avatar-preview');
        if(av) av.innerHTML='<img src="'+bc.foto+'" style="width:100%;height:100%;object-fit:cover;">';
      }
    }

    // ── Reglamento tabs visibility ──
    if(APP.reglamento) applyReglamentoTabs();

    // ── Categorías visibility — SOLO aplica estado, no da control a otros roles ──
    if(APP.categoriasConfig){
      var cc=APP.categoriasConfig;
      // Apply visibility for current user's portal group only
      var roleGroup = APP.currentUser ? {
        'estudiante':'estudiante','padre':'padre','profesor':'profe','admin':'sitio'
      }[APP.currentUser.role] : null;
      // Always apply all groups (admin set them, all must see the result)
      ['sitio','estudiante','padre','profe'].forEach(function(group){
        cc[group].forEach(function(cat,i){
          if(!cat.active) applyCatVisibility(group, i, false);
        });
      });
    }

    // ── Login design ──
    if(APP.loginDesign){
      var ld=APP.loginDesign;
      var ls=document.getElementById('login-screen');
      if(ls){
        if(ld.bgColor) ls.style.background=ld.bgColor;
        if(ld.bgImage){ ls.style.backgroundImage='url('+ld.bgImage+')'; ls.style.backgroundSize='cover'; }
      }
      var loginCard=document.querySelector('#login-screen .login-card');
      if(loginCard&&ld.cardColor) loginCard.style.background=ld.cardColor;
      var loginBtn=document.querySelector('#login-screen .btn-gold');
      if(loginBtn){
        if(ld.btnColor) loginBtn.style.background=ld.btnColor;
        if(ld.btnTxt) loginBtn.style.color=ld.btnTxt;
        if(ld.btnText) loginBtn.textContent=ld.btnText;
      }
      var loginH2=document.querySelector('#login-screen h2');
      if(loginH2&&ld.title) loginH2.textContent=ld.title;
    }

    // ── cfg fields: info, hero, mision, footer ──
    var fieldMap={
      'cfg-hero-title':'cfgHero.title','cfg-hero-desc':'cfgHero.desc',
      'cfg-facebook':'cfgFooter.facebook','cfg-whatsapp':'cfgFooter.whatsapp',
      'cfg-footer-copy':'cfgFooter.copy',
    };
    // (simple field restoration for inputs in config panel)
    // These get populated when admin opens the config tab — no DOM action needed here

    // Restore cfg-info fields
    if(APP.config){
      ['cfg-name','cfg-director','cfg-phone','cfg-email','cfg-direccion','cfg-distrito','cfg-horario','cfg-anio'].forEach(function(id){
        var el=document.getElementById(id);
        var key=id.replace('cfg-','');
        if(el&&APP.config[key]) el.value=APP.config[key];
      });
      var lemaEl=document.getElementById('cfg-lema');
      if(lemaEl&&APP.config.lema) lemaEl.value=APP.config.lema;
      // Apply live values
      if(APP.config.director){var dn=document.getElementById('director-name-display');if(dn)dn.textContent=APP.config.director;}
    }
    // Restore hero fields
    if(APP.cfgHero&&document.getElementById('cfg-hero-title')){
      var hf={'cfg-hero-title':'title','cfg-hero-subtitle-gold':'gold','cfg-hero-desc':'desc','cfg-hero-badge':'badge','cfg-stat1-num':'stat1n','cfg-stat1-lbl':'stat1l','cfg-stat2-num':'stat2n','cfg-stat2-lbl':'stat2l'};
      Object.keys(hf).forEach(function(id){var el=document.getElementById(id);if(el&&APP.cfgHero[hf[id]])el.value=APP.cfgHero[hf[id]];});
    }
    // Restore footer fields
    if(APP.cfgFooter){
      var ff={'cfg-facebook':'facebook','cfg-whatsapp':'whatsapp','cfg-instagram':'instagram','cfg-youtube':'youtube','cfg-footer-copy':'copy','cfg-maps':'maps'};
      Object.keys(ff).forEach(function(id){var el=document.getElementById(id);if(el&&APP.cfgFooter[ff[id]])el.value=APP.cfgFooter[ff[id]];});
    }
    console.log('✅ UI rehydrated from saved config');
  }catch(e){ console.warn('applyAllSavedConfig error:',e); }
}

// ── Run persistLoad on page startup (before any login) ──
(function initPersist(){
  persistLoad();
  // Apply login design even before login
  if(APP.loginDesign){
    var ld=APP.loginDesign;
    var ls=document.getElementById('login-screen');
    if(ls){
      if(ld.bgColor) ls.style.background=ld.bgColor;
      if(ld.bgImage){ ls.style.backgroundImage='url('+ld.bgImage+')'; ls.style.backgroundSize='cover'; }
    }
    var loginBtn=document.querySelector('#login-screen .btn-gold');
    if(loginBtn){
      if(ld.btnColor) loginBtn.style.background=ld.btnColor;
      if(ld.btnTxt) loginBtn.style.color=ld.btnTxt;
      if(ld.btnText) loginBtn.textContent=ld.btnText;
    }
    var loginH2=document.querySelector('#login-screen h2');
    if(loginH2&&ld.title) loginH2.textContent=ld.title;
    var loginCard=document.querySelector('#login-screen .login-card');
    if(loginCard&&ld.cardColor) loginCard.style.background=ld.cardColor;
  }
  // Apply reglamento tabs on startup
  if(typeof applyReglamentoTabs==='function') applyReglamentoTabs();
  // Apply category visibility (read-only for all roles — only admin can change)
  if(APP.categoriasConfig){
    var cc=APP.categoriasConfig;
    ['estudiante','padre','profe'].forEach(function(group){
      cc[group].forEach(function(cat,i){
        if(!cat.active) setTimeout(function(){ applyCatVisibility(group,i,false); },300);
      });
    });
  }
})();

// ================================================================
//  💰 PAGOS — Control de pagos y matrículas
// ================================================================
if(!APP.pagos) APP.pagos = [];

function renderPagos(){
  // Populate student dropdown
  var sel = document.getElementById('pago-estudiante');
  if(sel && sel.options.length <= 1){
    APP.students.forEach(function(s){
      var o = document.createElement('option');
      o.value = s.email;
      o.textContent = s.nombre+' '+s.apellido+' ('+s.grado+')';
      sel.appendChild(o);
    });
  }
  // Set default date
  var fd = document.getElementById('pago-fecha');
  if(fd && !fd.value) fd.value = new Date().toISOString().split('T')[0];

  var filtroMes    = (document.getElementById('pagos-filter-mes')    ||{}).value||'';
  var filtroTipo   = (document.getElementById('pagos-filter-tipo')   ||{}).value||'';
  var filtroEstado = (document.getElementById('pagos-filter-estado') ||{}).value||'';
  var search       = ((document.getElementById('pagos-search')       ||{}).value||'').toLowerCase();

  var pagos = (APP.pagos||[]).filter(function(p){
    var nombre = p.estudianteNombre ? p.estudianteNombre.toLowerCase() : '';
    return (!filtroMes    || p.mes    === filtroMes)
        && (!filtroTipo   || p.tipo   === filtroTipo)
        && (!filtroEstado || p.estado === filtroEstado)
        && (!search       || nombre.includes(search));
  });

  // Stats
  var total    = pagos.reduce(function(a,p){return a+(p.estado==='Pagado'?+p.monto:0);},0);
  var pendiente= pagos.reduce(function(a,p){return a+(p.estado!=='Pagado'?+p.monto:0);},0);
  var nPag = pagos.filter(function(p){return p.estado==='Pagado';}).length;
  var nPend= pagos.filter(function(p){return p.estado!=='Pagado';}).length;

  var statsEl = document.getElementById('pagos-stats');
  if(statsEl) statsEl.innerHTML = [
    {icon:'💵',label:'Total Cobrado',val:'RD$ '+total.toLocaleString(),color:'#16a34a',bg:'#dcfce7'},
    {icon:'⏳',label:'Pendiente',val:'RD$ '+pendiente.toLocaleString(),color:'#d97706',bg:'#fef3c7'},
    {icon:'✅',label:'Pagos registrados',val:nPag,color:'#2563eb',bg:'#dbeafe'},
    {icon:'❌',label:'Sin pagar',val:nPend,color:'#dc2626',bg:'#fee2e2'},
  ].map(function(s){
    return '<div style="background:'+s.bg+';border-radius:12px;padding:14px 16px;">'
      +'<div style="font-size:22px;">'+s.icon+'</div>'
      +'<div style="font-size:20px;font-weight:800;color:'+s.color+';">'+s.val+'</div>'
      +'<div style="font-size:12px;color:#666;">'+s.label+'</div>'
      +'</div>';
  }).join('');

  // Table
  var wrap = document.getElementById('pagos-table-wrap');
  if(!wrap) return;
  if(!pagos.length){ wrap.innerHTML='<p style="color:#888;padding:20px;text-align:center;">No hay pagos registrados con esos filtros.</p>'; return; }

  var estadoStyle = {
    'Pagado':'background:#dcfce7;color:#16a34a;',
    'Pendiente':'background:#fef3c7;color:#d97706;',
    'Vencido':'background:#fee2e2;color:#dc2626;'
  };

  wrap.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    +'<thead><tr style="background:var(--navy);color:white;">'
    +'<th style="padding:10px 12px;text-align:left;">Estudiante</th>'
    +'<th style="padding:10px 12px;">Tipo</th>'
    +'<th style="padding:10px 12px;">Mes</th>'
    +'<th style="padding:10px 12px;">Monto</th>'
    +'<th style="padding:10px 12px;">Método</th>'
    +'<th style="padding:10px 12px;">Fecha</th>'
    +'<th style="padding:10px 12px;">Estado</th>'
    +'<th style="padding:10px 12px;">Acciones</th>'
    +'</tr></thead><tbody>'
    + pagos.map(function(p,i){
        var realIdx = APP.pagos.indexOf(p);
        return '<tr style="border-bottom:1px solid var(--border);">'
          +'<td style="padding:10px 12px;font-weight:600;">'+p.estudianteNombre+'</td>'
          +'<td style="padding:10px 12px;text-align:center;">'+p.tipo+'</td>'
          +'<td style="padding:10px 12px;text-align:center;">'+p.mes+'</td>'
          +'<td style="padding:10px 12px;text-align:center;font-weight:700;color:#16a34a;">RD$ '+Number(p.monto).toLocaleString()+'</td>'
          +'<td style="padding:10px 12px;text-align:center;">'+p.metodo+'</td>'
          +'<td style="padding:10px 12px;text-align:center;">'+p.fecha+'</td>'
          +'<td style="padding:10px 12px;text-align:center;"><span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;'+(estadoStyle[p.estado]||'')+'">'+p.estado+'</span></td>'
          +'<td style="padding:10px 12px;text-align:center;">'
          +'<button onclick="imprimirRecibo('+realIdx+')" style="background:none;border:none;cursor:pointer;font-size:16px;" title="Imprimir recibo">🖨️</button> '
          +'<button onclick="deletePago('+realIdx+')" style="background:none;border:none;cursor:pointer;font-size:16px;color:#ef4444;" title="Eliminar">🗑️</button>'
          +'</td></tr>';
      }).join('')
    +'</tbody></table>';
}

function savePago(){
  var estEmail = document.getElementById('pago-estudiante').value;
  var monto    = document.getElementById('pago-monto').value;
  if(!estEmail||!monto){ toast('Complete todos los campos requeridos','error'); return; }
  var st = APP.students.find(function(s){return s.email===estEmail;});
  if(!st){ toast('Estudiante no encontrado','error'); return; }
  var pago = {
    id: 'PAG-'+Date.now(),
    estudianteEmail: estEmail,
    estudianteNombre: st.nombre+' '+st.apellido,
    grado: st.grado,
    tipo:   document.getElementById('pago-tipo').value,
    mes:    document.getElementById('pago-mes').value,
    monto:  parseFloat(monto),
    estado: document.getElementById('pago-estado').value,
    fecha:  document.getElementById('pago-fecha').value,
    metodo: document.getElementById('pago-metodo').value,
    notas:  document.getElementById('pago-notas').value,
    fechaRegistro: new Date().toLocaleDateString('es-DO')
  };
  APP.pagos.push(pago);
  persistSave();
  closeModal('modal-pago');
  renderPagos();
  // Notify padre if linked
  if(st.emailPadre){
    addNotifToUser(st.emailPadre, '💰 Pago registrado: '+pago.tipo+' '+pago.mes+' — RD$ '+pago.monto.toLocaleString());
  }
  toast('✅ Pago registrado correctamente','success');
  logAudit('pago','Pago registrado: '+pago.estudianteNombre+' '+pago.tipo+' '+pago.mes);
}

function deletePago(idx){
  if(!confirm('¿Eliminar este pago?')) return;
  APP.pagos.splice(idx,1);
  persistSave();
  renderPagos();
  toast('Pago eliminado','info');
}

function imprimirRecibo(idx){
  var p = APP.pagos[idx];
  if(!p) return;
  var w = window.open('','_blank','width=500,height=600');
  w.document.write(`<!DOCTYPE html><html><head><title>Recibo</title>
  <style>body{font-family:Arial,sans-serif;padding:30px;max-width:420px;margin:0 auto;}
  .logo{text-align:center;margin-bottom:20px;} h1{font-size:18px;} h2{font-size:22px;color:#16213e;}
  .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;font-size:14px;}
  .total{font-size:18px;font-weight:800;color:#16a34a;} .footer{margin-top:24px;text-align:center;font-size:11px;color:#888;}
  @media print{button{display:none!important;}}</style></head><body>
  <div class="logo"><div style="font-size:40px;">🏫</div>
  <h2>C.E. Otilia Peláez</h2>
  <p style="font-size:12px;color:#888;">Av. Charles de Gaulle, Sabana Perdida · (809) 590-0771</p>
  </div>
  <h1 style="text-align:center;border-top:3px solid #16213e;border-bottom:3px solid #16213e;padding:8px 0;">RECIBO DE PAGO</h1>
  <div class="row"><span>N° Recibo</span><span>${p.id}</span></div>
  <div class="row"><span>Estudiante</span><span><b>${p.estudianteNombre}</b></span></div>
  <div class="row"><span>Grado</span><span>${p.grado}</span></div>
  <div class="row"><span>Concepto</span><span>${p.tipo} — ${p.mes}</span></div>
  <div class="row"><span>Método de pago</span><span>${p.metodo}</span></div>
  <div class="row"><span>Fecha</span><span>${p.fecha}</span></div>
  <div class="row total"><span>MONTO PAGADO</span><span>RD$ ${Number(p.monto).toLocaleString()}</span></div>
  ${p.notas?'<p style="font-size:12px;color:#888;margin-top:8px;">Nota: '+p.notas+'</p>':''}
  <div class="footer">
    <p>Este recibo es válido como comprobante de pago.</p>
    <p>Generado el ${new Date().toLocaleDateString('es-DO')} · Sistema C.E. Otilia Peláez</p>
  </div>
  <div style="text-align:center;margin-top:20px;"><button onclick="window.print()" style="padding:8px 20px;background:#16213e;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;">🖨️ Imprimir</button></div>
  </body></html>`);
  w.document.close();
}

function exportPagosCSV(){
  var rows = [['ID','Estudiante','Grado','Tipo','Mes','Monto','Estado','Método','Fecha']];
  APP.pagos.forEach(function(p){
    rows.push([p.id,p.estudianteNombre,p.grado,p.tipo,p.mes,p.monto,p.estado,p.metodo,p.fecha]);
  });
  var csv = rows.map(function(r){return r.join(',');}).join('\n');
  var blob = new Blob([csv],{type:'text/csv'});
  var a = document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='pagos_otilia_'+new Date().toISOString().split('T')[0]+'.csv';
  a.click();
}

// ================================================================
//  🗓️ CALENDARIO ESCOLAR
// ================================================================
if(!APP.eventos) APP.eventos = [
  // Pre-loaded events for 2025-2026
  {id:'EV-001',titulo:'Inicio año escolar',fecha:'2025-08-26',tipo:'evento',desc:'Inicio del año escolar 2025-2026',visEst:true,visPadre:true,visProfe:true},
  {id:'EV-002',titulo:'Exámenes 1er Trimestre',fecha:'2025-11-10',tipo:'examen',desc:'Exámenes del primer trimestre',visEst:true,visPadre:true,visProfe:true},
  {id:'EV-003',titulo:'Vacaciones Navideñas',fecha:'2025-12-20',tipo:'feriado',desc:'Inicio vacaciones navideñas. Regreso 6 enero',visEst:true,visPadre:true,visProfe:true},
  {id:'EV-004',titulo:'Regreso clases enero',fecha:'2026-01-06',tipo:'evento',desc:'Regreso de vacaciones navideñas',visEst:true,visPadre:true,visProfe:true},
  {id:'EV-005',titulo:'Día de la Altagracia',fecha:'2026-01-21',tipo:'feriado',desc:'Feriado nacional',visEst:true,visPadre:true,visProfe:true},
  {id:'EV-006',titulo:'Día de Duarte',fecha:'2026-01-26',tipo:'feriado',desc:'Feriado nacional',visEst:true,visPadre:true,visProfe:true},
  {id:'EV-007',titulo:'Día de la Independencia',fecha:'2026-02-27',tipo:'feriado',desc:'Feriado nacional - Independencia dominicana',visEst:true,visPadre:true,visProfe:true},
  {id:'EV-008',titulo:'Exámenes 2do Trimestre',fecha:'2026-03-09',tipo:'examen',desc:'Exámenes del segundo trimestre',visEst:true,visPadre:true,visProfe:true},
  {id:'EV-009',titulo:'Semana Santa',fecha:'2026-04-02',tipo:'feriado',desc:'Inicio Semana Santa',visEst:true,visPadre:true,visProfe:true},
  {id:'EV-010',titulo:'Día del Trabajo',fecha:'2026-05-01',tipo:'feriado',desc:'Feriado nacional',visEst:true,visPadre:true,visProfe:true},
  {id:'EV-011',titulo:'Exámenes 3er Trimestre',fecha:'2026-06-08',tipo:'examen',desc:'Exámenes finales del año escolar',visEst:true,visPadre:true,visProfe:true},
  {id:'EV-012',titulo:'Acto de Graduación',fecha:'2026-07-10',tipo:'actividad',desc:'Ceremonia de graduación 6° de Secundaria',visEst:true,visPadre:true,visProfe:true},
];

var _calYear  = new Date().getFullYear();
var _calMonth = new Date().getMonth(); // 0-based

var CAL_COLORS = { examen:'#ef4444', evento:'#3b82f6', feriado:'#22c55e', reunion:'#f59e0b', actividad:'#8b5cf6' };
var MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function calNav(dir){
  _calMonth += dir;
  if(_calMonth > 11){ _calMonth=0; _calYear++; }
  if(_calMonth < 0){ _calMonth=11; _calYear--; }
  renderCalendario();
}

function renderCalendario(){
  var label = document.getElementById('cal-mes-label');
  if(label) label.textContent = MESES_ES[_calMonth]+' '+_calYear;

  var grid = document.getElementById('cal-grid');
  if(!grid) return;

  var firstDay = new Date(_calYear, _calMonth, 1).getDay();
  var daysInMonth = new Date(_calYear, _calMonth+1, 0).getDate();
  var today = new Date();

  // Build event map for this month
  var eventMap = {};
  (APP.eventos||[]).forEach(function(ev){
    var d = new Date(ev.fecha+'T12:00:00');
    if(d.getFullYear()===_calYear && d.getMonth()===_calMonth){
      var day = d.getDate();
      if(!eventMap[day]) eventMap[day]=[];
      eventMap[day].push(ev);
    }
  });

  var cells = '';
  // Empty cells before first day
  for(var i=0;i<firstDay;i++) cells += '<div></div>';
  // Day cells
  for(var d=1;d<=daysInMonth;d++){
    var isToday = today.getFullYear()===_calYear && today.getMonth()===_calMonth && today.getDate()===d;
    var evs = eventMap[d]||[];
    var dots = evs.map(function(e){return '<span style="width:6px;height:6px;border-radius:50%;background:'+CAL_COLORS[e.tipo]+';display:inline-block;margin:0 1px;"></span>';}).join('');
    cells += '<div onclick="showDayEvents('+d+')" style="min-height:52px;padding:6px 4px;border-radius:8px;cursor:pointer;'
      +(isToday?'background:var(--navy);color:white;font-weight:800;':'border:1px solid var(--border);')
      +(evs.length && !isToday?'background:#f0f4ff;':'')
      +' transition:.15s;" onmouseover="this.style.opacity=\'0.8\'" onmouseout="this.style.opacity=\'1\'">'
      +'<div style="font-size:13px;font-weight:600;margin-bottom:2px;">'+d+'</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:1px;">'+dots+'</div>'
      +'</div>';
  }
  grid.innerHTML = cells;

  // Upcoming events
  var now = new Date();
  var proximos = (APP.eventos||[])
    .filter(function(e){ return new Date(e.fecha+'T12:00:00') >= now; })
    .sort(function(a,b){ return new Date(a.fecha) - new Date(b.fecha); })
    .slice(0,6);

  var proxEl = document.getElementById('cal-proximos');
  if(proxEl) proxEl.innerHTML = proximos.length
    ? proximos.map(function(e){
        var d = new Date(e.fecha+'T12:00:00');
        var diff = Math.ceil((d-now)/(1000*60*60*24));
        return '<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;margin-bottom:8px;background:#f8fafc;border-left:4px solid '+CAL_COLORS[e.tipo]+'">'
          +'<div style="text-align:center;min-width:40px;">'
          +'<div style="font-size:18px;font-weight:800;color:'+CAL_COLORS[e.tipo]+';">'+d.getDate()+'</div>'
          +'<div style="font-size:10px;color:#888;">'+MESES_ES[d.getMonth()].slice(0,3)+'</div>'
          +'</div>'
          +'<div style="flex:1;"><div style="font-weight:600;font-size:14px;">'+e.titulo+'</div>'
          +(e.desc?'<div style="font-size:12px;color:#888;">'+e.desc+'</div>':'')+'</div>'
          +'<div style="font-size:11px;color:#888;white-space:nowrap;">'+(diff===0?'Hoy':diff===1?'Mañana':'En '+diff+' días')+'</div>'
          +'<button onclick="deleteEvento(\''+e.id+'\')" style="background:none;border:none;cursor:pointer;color:#ccc;font-size:14px;">✕</button>'
          +'</div>';
      }).join('')
    : '<p style="color:#888;text-align:center;padding:20px;">No hay eventos próximos.</p>';
}

function showDayEvents(day){
  var evs = (APP.eventos||[]).filter(function(e){
    var d = new Date(e.fecha+'T12:00:00');
    return d.getFullYear()===_calYear && d.getMonth()===_calMonth && d.getDate()===day;
  });
  if(!evs.length){
    // Pre-fill date in modal
    var fechaStr = _calYear+'-'+String(_calMonth+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
    var ef = document.getElementById('evento-fecha');
    if(ef) ef.value = fechaStr;
    openModal('modal-evento');
    return;
  }
  var msg = MESES_ES[_calMonth]+' '+day+', '+_calYear+'\n\n'
    + evs.map(function(e){return '• '+e.titulo+(e.desc?' — '+e.desc:'');}).join('\n');
  alert(msg);
}

function saveEvento(){
  var titulo = (document.getElementById('evento-titulo')||{}).value||'';
  var fecha  = (document.getElementById('evento-fecha') ||{}).value||'';
  if(!titulo||!fecha){ toast('Completa título y fecha','error'); return; }
  var ev = {
    id:'EV-'+Date.now(),
    titulo:titulo,
    fecha:fecha,
    tipo:(document.getElementById('evento-tipo')||{}).value||'evento',
    desc:(document.getElementById('evento-desc')||{}).value||'',
    visEst:  (document.getElementById('ev-vis-est')  ||{}).checked!==false,
    visPadre:(document.getElementById('ev-vis-padre')||{}).checked!==false,
    visProfe:(document.getElementById('ev-vis-profe')||{}).checked!==false,
  };
  APP.eventos.push(ev);
  persistSave();
  closeModal('modal-evento');
  // Clear form
  ['evento-titulo','evento-fecha','evento-desc'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  renderCalendario();
  // Broadcast notification
  broadcastNotif('todos','🗓️ Nuevo evento: '+ev.titulo,'Fecha: '+ev.fecha+(ev.desc?' — '+ev.desc:''));
  toast('✅ Evento agregado','success');
  logAudit('evento','Evento creado: '+ev.titulo+' ('+ev.fecha+')');
}

function deleteEvento(id){
  APP.eventos = (APP.eventos||[]).filter(function(e){return e.id!==id;});
  persistSave();
  renderCalendario();
  toast('Evento eliminado','info');
}

// Calendario for student/padre portals
function renderCalendarioPortal(containerId, role){
  var el = document.getElementById(containerId);
  if(!el) return;
  var now = new Date();
  var evs = (APP.eventos||[]).filter(function(e){
    var vis = role==='estudiante' ? e.visEst : role==='padre' ? e.visPadre : e.visProfe;
    return vis && new Date(e.fecha+'T12:00:00') >= now;
  }).sort(function(a,b){return new Date(a.fecha)-new Date(b.fecha);}).slice(0,10);

  el.innerHTML = evs.length
    ? evs.map(function(e){
        var d = new Date(e.fecha+'T12:00:00');
        var diff = Math.ceil((d-now)/(1000*60*60*24));
        return '<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;margin-bottom:8px;background:white;border-left:4px solid '+CAL_COLORS[e.tipo]+';box-shadow:0 2px 6px rgba(0,0,0,.06);">'
          +'<div style="text-align:center;min-width:40px;"><div style="font-size:18px;font-weight:800;color:'+CAL_COLORS[e.tipo]+';">'+d.getDate()+'</div><div style="font-size:10px;color:#888;">'+MESES_ES[d.getMonth()].slice(0,3)+'</div></div>'
          +'<div style="flex:1;"><div style="font-weight:600;font-size:14px;">'+e.titulo+'</div>'+(e.desc?'<div style="font-size:12px;color:#888;">'+e.desc+'</div>':'')+'</div>'
          +'<span style="font-size:11px;color:white;background:'+CAL_COLORS[e.tipo]+';padding:2px 8px;border-radius:12px;">'+(diff===0?'Hoy':diff===1?'Mañana':''+diff+'d')+'</span>'
          +'</div>';
      }).join('')
    : '<p style="color:#888;text-align:center;padding:20px;">No hay eventos próximos.</p>';
}

// ================================================================
//  🏆 RANKING Y ESTADÍSTICAS
// ================================================================
function renderRanking(){
  var trimestre = (document.getElementById('ranking-trimestre')||{}).value||'2';

  // Calculate student averages
  var estudiantesConNotas = APP.students.map(function(s){
    var notas = (APP.notas||[]).filter(function(n){
      return n.email===s.email && (trimestre==='anual' || String(n.trimestre||'2')===trimestre);
    });
    var avg = notas.length ? notas.reduce(function(a,n){return a+Number(n.calificacion||0);},0)/notas.length : null;
    return { nombre:s.nombre+' '+s.apellido, grado:s.grado, email:s.email, promedio:avg, total:notas.length };
  }).filter(function(s){return s.promedio!==null;})
    .sort(function(a,b){return b.promedio-a.promedio;});

  // KPIs
  var allNotas = (APP.notas||[]).filter(function(n){ return trimestre==='anual'||String(n.trimestre||'2')===trimestre; });
  var promedioGeneral = allNotas.length ? allNotas.reduce(function(a,n){return a+Number(n.calificacion||0);},0)/allNotas.length : 0;
  var aprobados = estudiantesConNotas.filter(function(s){return s.promedio>=70;}).length;
  var reprobados = estudiantesConNotas.length - aprobados;
  var ausTotal = (APP.ausencias||[]).length;
  var asistenciaPct = APP.students.length>0 ? Math.max(0,100 - (ausTotal/(APP.students.length*180)*100)).toFixed(1) : 100;

  var kpisEl = document.getElementById('ranking-kpis');
  if(kpisEl) kpisEl.innerHTML = [
    {icon:'📊',label:'Promedio General',val:promedioGeneral.toFixed(1),color:'#2563eb',bg:'#dbeafe'},
    {icon:'✅',label:'Aprobados',val:aprobados,color:'#16a34a',bg:'#dcfce7'},
    {icon:'❌',label:'Reprobados',val:reprobados,color:'#dc2626',bg:'#fee2e2'},
    {icon:'📅',label:'Tasa de Asistencia',val:asistenciaPct+'%',color:'#7c3aed',bg:'#ede9fe'},
    {icon:'🎓',label:'Total Estudiantes',val:APP.students.length,color:'#0369a1',bg:'#e0f2fe'},
    {icon:'📋',label:'Notas Registradas',val:allNotas.length,color:'#b45309',bg:'#fef3c7'},
  ].map(function(k){
    return '<div style="background:'+k.bg+';border-radius:12px;padding:14px 16px;text-align:center;">'
      +'<div style="font-size:24px;">'+k.icon+'</div>'
      +'<div style="font-size:22px;font-weight:800;color:'+k.color+';">'+k.val+'</div>'
      +'<div style="font-size:12px;color:#555;">'+k.label+'</div>'
      +'</div>';
  }).join('');

  // Top 10
  var topEl = document.getElementById('ranking-top-list');
  if(topEl) topEl.innerHTML = estudiantesConNotas.slice(0,10).length
    ? estudiantesConNotas.slice(0,10).map(function(s,i){
        var medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1);
        var color = s.promedio>=90?'#16a34a':s.promedio>=80?'#2563eb':s.promedio>=70?'#d97706':'#dc2626';
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;margin-bottom:6px;background:white;border:1px solid var(--border);">'
          +'<span style="font-size:18px;min-width:28px;text-align:center;">'+medal+'</span>'
          +'<div style="flex:1;"><div style="font-weight:600;font-size:13px;">'+s.nombre+'</div><div style="font-size:11px;color:#888;">'+s.grado+'</div></div>'
          +'<span style="font-size:16px;font-weight:800;color:'+color+';">'+s.promedio.toFixed(1)+'</span>'
          +'</div>';
      }).join('')
    : '<p style="color:#888;font-size:13px;padding:12px;">Sin notas registradas.</p>';

  // By grade
  var grades = {};
  estudiantesConNotas.forEach(function(s){
    if(!grades[s.grado]){grades[s.grado]={sum:0,count:0};}
    grades[s.grado].sum+=s.promedio; grades[s.grado].count++;
  });
  var gradoEl = document.getElementById('ranking-grado-list');
  if(gradoEl) gradoEl.innerHTML = Object.keys(grades).length
    ? Object.keys(grades).sort().map(function(g){
        var avg = grades[g].sum/grades[g].count;
        var w = Math.min(100, avg);
        var c = avg>=90?'#16a34a':avg>=80?'#2563eb':avg>=70?'#d97706':'#dc2626';
        return '<div style="margin-bottom:10px;">'
          +'<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">'
          +'<span style="font-weight:600;">'+g+'</span>'
          +'<span style="font-weight:700;color:'+c+';">'+avg.toFixed(1)+'</span>'
          +'</div>'
          +'<div style="height:8px;background:#f0f0f0;border-radius:4px;">'
          +'<div style="height:100%;width:'+w+'%;background:'+c+';border-radius:4px;transition:.4s;"></div>'
          +'</div>'
          +'</div>';
      }).join('')
    : '<p style="color:#888;font-size:13px;padding:12px;">Sin datos.</p>';

  // Distribution chart
  var ranges = [{label:'0-59',min:0,max:59,color:'#ef4444'},{label:'60-69',min:60,max:69,color:'#f97316'},{label:'70-79',min:70,max:79,color:'#f59e0b'},{label:'80-89',min:80,max:89,color:'#22c55e'},{label:'90-100',min:90,max:100,color:'#3b82f6'}];
  var distribEl = document.getElementById('ranking-distrib');
  var distribLabels = document.getElementById('ranking-distrib-labels');
  if(distribEl){
    var counts = ranges.map(function(r){
      return allNotas.filter(function(n){var v=Number(n.calificacion||0);return v>=r.min&&v<=r.max;}).length;
    });
    var maxCount = Math.max(1,...counts);
    distribEl.innerHTML = counts.map(function(c,i){
      var h = Math.max(4, Math.round((c/maxCount)*100));
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;">'
        +'<span style="font-size:11px;font-weight:700;color:'+ranges[i].color+';">'+c+'</span>'
        +'<div style="width:100%;background:'+ranges[i].color+';border-radius:4px 4px 0 0;height:'+h+'px;transition:.4s;"></div>'
        +'</div>';
    }).join('');
    if(distribLabels) distribLabels.innerHTML = ranges.map(function(r,i){
      return '<span style="font-size:11px;color:#888;">'+r.label+'</span>';
    }).join('');
  }
}

// ================================================================
//  🔔 NOTIFICACIONES EN TIEMPO REAL
// ================================================================
if(!APP._notifHistory) APP._notifHistory = [];
if(!APP._userNotifs) APP._userNotifs = {};

function addNotifToUser(email, msg){
  if(!APP._userNotifs) APP._userNotifs = {};
  if(!APP._userNotifs[email]) APP._userNotifs[email] = [];
  APP._userNotifs[email].unshift({ msg:msg, fecha:new Date().toLocaleDateString('es-DO'), leida:false });
  persistSave();
  // Live badge update if user is logged in
  if(APP.currentUser && APP.currentUser.email === email){
    updateNotifBadge();
  }
}

function broadcastNotif(destino, titulo, msg){
  var targets = [];
  if(destino==='todos'||destino==='estudiantes') targets = targets.concat(APP.students.map(function(s){return s.email;}));
  if(destino==='todos'||destino==='padres')      targets = targets.concat((APP.padres||[]).map(function(p){return p.email;}));
  if(destino==='todos'||destino==='profesores')  targets.push(APP.accounts.profesor.email);

  targets.forEach(function(email){ addNotifToUser(email, titulo+': '+msg); });
  
  // Save to history
  APP._notifHistory.unshift({
    titulo:titulo, msg:msg, destino:destino,
    total:targets.length,
    fecha:new Date().toLocaleDateString('es-DO'),
    hora:new Date().toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'})
  });
  persistSave();
  renderNotifsAdmin();
  toast('🔔 Notificación enviada a '+targets.length+' usuario(s)','success');
  logAudit('notif','Notificación enviada ('+destino+'): '+titulo);
}

function sendNotifAdmin(){
  var titulo = (document.getElementById('notif-titulo')||{}).value||'';
  var msg    = (document.getElementById('notif-msg')   ||{}).value||'';
  if(!titulo||!msg){ toast('Completa título y mensaje','error'); return; }
  var dests = [];
  if((document.getElementById('notif-dest-est')  ||{}).checked) dests.push('estudiantes');
  if((document.getElementById('notif-dest-padre')||{}).checked) dests.push('padres');
  if((document.getElementById('notif-dest-profe')||{}).checked) dests.push('profesores');
  dests.forEach(function(d){ broadcastNotif(d,titulo,msg); });
  closeModal('modal-notif');
  document.getElementById('notif-titulo').value='';
  document.getElementById('notif-msg').value='';
}

function renderNotifsAdmin(){
  var el = document.getElementById('notifs-history-list');
  if(!el) return;
  var hist = (APP._notifHistory||[]);
  if(!hist.length){ el.innerHTML='<p style="color:#888;text-align:center;padding:20px;">No se han enviado notificaciones todavía.</p>'; return; }
  el.innerHTML = hist.slice(0,20).map(function(n){
    var destIcon = n.destino==='todos'?'👥':n.destino==='padres'?'👪':n.destino==='profesores'?'📚':'🎓';
    return '<div style="display:flex;align-items:flex-start;gap:12px;padding:12px;border-radius:10px;margin-bottom:8px;background:#f8fafc;border:1px solid var(--border);">'
      +'<div style="font-size:24px;">'+destIcon+'</div>'
      +'<div style="flex:1;">'
      +'<div style="font-weight:700;font-size:14px;">'+n.titulo+'</div>'
      +'<div style="font-size:12px;color:#555;margin:2px 0;">'+n.msg+'</div>'
      +'<div style="font-size:11px;color:#888;">'+n.fecha+' '+n.hora+' · '+n.total+' destinatarios</div>'
      +'</div>'
      +'</div>';
  }).join('');
}

function getUserNotifs(){
  if(!APP.currentUser||!APP._userNotifs) return [];
  return APP._userNotifs[APP.currentUser.email]||[];
}

function updateNotifBadge(){
  var notifs = getUserNotifs();
  var unread = notifs.filter(function(n){return !n.leida;}).length;
  var badge = document.getElementById('notif-badge-count');
  if(badge){
    badge.textContent = unread;
    badge.style.display = unread>0 ? 'flex' : 'none';
  }
}

function renderUserNotifs(containerId){
  var el = document.getElementById(containerId);
  if(!el) return;
  var notifs = getUserNotifs();
  // Mark all as read
  notifs.forEach(function(n){n.leida=true;});
  persistSave();
  updateNotifBadge();
  if(!notifs.length){ el.innerHTML='<p style="color:#888;padding:16px;text-align:center;">Sin notificaciones.</p>'; return; }
  el.innerHTML = notifs.slice(0,15).map(function(n){
    return '<div style="padding:10px 12px;border-radius:8px;margin-bottom:6px;background:white;border-left:3px solid var(--gold);box-shadow:0 2px 6px rgba(0,0,0,.05);">'
      +'<div style="font-size:13px;font-weight:600;">'+n.msg+'</div>'
      +'<div style="font-size:11px;color:#888;margin-top:3px;">'+n.fecha+'</div>'
      +'</div>';
  }).join('');
}

// Add to PERSIST_KEYS retroactively





// Hook notifications into existing operations
var _origSaveHorario = typeof saveHorario==='function' ? saveHorario : null;

// Auto-render calendar on student/padre portals when section is shown
var _origShowEstSection = typeof showEstudianteSection==='function' ? showEstudianteSection : null;

// ================================================================
//  📦 PRODUCTOS — Gestión de productos con ganancia
// ================================================================
if(!APP.productos) APP.productos = [
  // ── UNIFORME DIARIO ──────────────────────────────────────────────
  {id:'P001',nombre:'Pantalón Azul Marino',cat:'Uniforme Diario',precio:600,costo:350,desc:'Pantalón azul marino oficial, igual para todos los estudiantes'},
  {id:'P002',nombre:'Camisa Blanca (con logo)',cat:'Uniforme Diario',precio:450,costo:250,desc:'Camisa blanca con logo bordado C.E. Otilia Peláez'},
  {id:'P003',nombre:'Poloche Blanco (con logo)',cat:'Uniforme Diario',precio:400,costo:220,desc:'Poloche/polo blanco con logo C.E. Otilia Peláez'},
  {id:'P004',nombre:'Uniforme Diario Completo',cat:'Uniforme Diario',precio:1350,costo:780,desc:'Pantalón azul + camisa blanca + poloche blanco'},
  // ── UNIFORME DEPORTIVO ───────────────────────────────────────────
  {id:'P005',nombre:'Pantalón Deportivo Gris',cat:'Uniforme Deportivo',precio:500,costo:280,desc:'Pantalón gris para días de educación física y deporte'},
  {id:'P006',nombre:'Franela Deportiva Gris',cat:'Uniforme Deportivo',precio:380,costo:200,desc:'Franela gris para educación física'},
  {id:'P007',nombre:'Uniforme Deportivo Completo',cat:'Uniforme Deportivo',precio:800,costo:450,desc:'Pantalón gris + franela gris deportiva'},
  // ── TÉCNICO: MEDICINA ────────────────────────────────────────────
  {id:'P008',nombre:'Pijama / Scrub Médico (Blanco)',cat:'Técnico Medicina',precio:950,costo:550,desc:'Uniforme de salida técnico en Medicina — scrub blanco oficial'},
  {id:'P009',nombre:'Filipina Técnico Medicina',cat:'Técnico Medicina',precio:600,costo:340,desc:'Filipina/bata blanca para práctica y salida técnico en Medicina'},
  {id:'P010',nombre:'Kit Completo Medicina',cat:'Técnico Medicina',precio:1400,costo:820,desc:'Scrub + filipina + gafete para técnico en Medicina'},
  // ── TÉCNICO: MULTIMEDIA ──────────────────────────────────────────
  {id:'P011',nombre:'Camisa Técnico Multimedia',cat:'Técnico Multimedia',precio:500,costo:280,desc:'Camisa oficial de salida técnico en Multimedia'},
  {id:'P012',nombre:'Pantalón Técnico Multimedia',cat:'Técnico Multimedia',precio:580,costo:320,desc:'Pantalón de salida técnico en Multimedia'},
  {id:'P013',nombre:'Kit Completo Multimedia',cat:'Técnico Multimedia',precio:980,costo:560,desc:'Camisa + pantalón de salida técnico en Multimedia'},
  // ── TÉCNICO: GRÁFICA ─────────────────────────────────────────────
  {id:'P014',nombre:'Camisa Técnico Gráfica',cat:'Técnico Gráfica',precio:500,costo:280,desc:'Camisa oficial de salida técnico en Gráfica'},
  {id:'P015',nombre:'Pantalón Técnico Gráfica',cat:'Técnico Gráfica',precio:580,costo:320,desc:'Pantalón de salida técnico en Gráfica'},
  {id:'P016',nombre:'Kit Completo Gráfica',cat:'Técnico Gráfica',precio:980,costo:560,desc:'Camisa + pantalón de salida técnico en Gráfica'},
  // ── RETIROS ──────────────────────────────────────────────────────
  {id:'P017',nombre:'Retiro Temprano',cat:'Retiro',precio:200,costo:0,desc:'Cargo administrativo por retiro antes del horario regular'},
  {id:'P018',nombre:'Retiro con Autorización',cat:'Retiro',precio:0,costo:0,desc:'Retiro autorizado por padre/tutor — sin cargo'},
  // ── MATRÍCULA Y MENSUALIDAD ──────────────────────────────────────
  {id:'P019',nombre:'Matrícula Año Escolar 2025-2026',cat:'Matrícula',precio:3500,costo:0,desc:'Matrícula oficial año escolar 2025-2026'},
  {id:'P020',nombre:'Mensualidad Regular',cat:'Mensualidad',precio:1500,costo:0,desc:'Mensualidad nivel primario y secundario'},
  {id:'P021',nombre:'Mensualidad Bachillerato Técnico',cat:'Mensualidad',precio:2000,costo:0,desc:'Mensualidad nivel bachillerato con técnico'},
  // ── OTROS ────────────────────────────────────────────────────────
  {id:'P022',nombre:'Papelería Semestral',cat:'Papelería',precio:600,costo:350,desc:'Kit de papelería obligatorio por semestre'},
  {id:'P023',nombre:'Libros de Texto',cat:'Libros',precio:2500,costo:1800,desc:'Set completo de libros por grado'},
];

function previewGanancia(){
  var precio = parseFloat(document.getElementById('prod-precio').value)||0;
  var costo  = parseFloat(document.getElementById('prod-costo').value)||0;
  var el = document.getElementById('prod-ganancia-pct');
  if(!el) return;
  if(precio>0){
    var pct = ((precio-costo)/precio*100).toFixed(1);
    var gananciaMonto = (precio-costo).toLocaleString();
    el.textContent = pct+'%  (RD$ '+gananciaMonto+')';
    el.style.color = parseFloat(pct)>0 ? '#16a34a' : '#dc2626';
  } else {
    el.textContent = '0%';
  }
}

function saveProducto(){
  var nombre = (document.getElementById('prod-nombre')||{}).value||'';
  var precio = parseFloat((document.getElementById('prod-precio')||{}).value)||0;
  if(!nombre||!precio){ toast('Nombre y precio son obligatorios','error'); return; }
  var prod = {
    id:'P-'+Date.now(),
    nombre:nombre,
    cat:(document.getElementById('prod-cat')||{}).value||'Otro',
    precio:precio,
    costo:parseFloat((document.getElementById('prod-costo')||{}).value)||0,
    desc:(document.getElementById('prod-desc')||{}).value||''
  };
  APP.productos.push(prod);
  persistSave();
  ['prod-nombre','prod-precio','prod-costo','prod-desc'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  renderProductosList();
  toast('✅ Producto agregado','success');
  logAudit('producto','Producto creado: '+prod.nombre+' RD$'+prod.precio);
}

function deleteProducto(id){
  APP.productos = APP.productos.filter(function(p){return p.id!==id;});
  persistSave();
  renderProductosList();
  toast('Producto eliminado','info');
}

function renderProductosList(){
  var el = document.getElementById('productos-list');
  if(!el) return;
  var prods = APP.productos||[];

  // Build category groups
  var cats = {};
  prods.forEach(function(p){ if(!cats[p.cat]) cats[p.cat]=[]; cats[p.cat].push(p); });

  var CAT_ICONS = {
    'Uniforme Diario':'👔','Uniforme Deportivo':'🩶',
    'Técnico Medicina':'🏥','Técnico Multimedia':'🎬','Técnico Gráfica':'🎨',
    'Retiro':'📤','Matrícula':'🎓','Mensualidad':'💵',
    'Papelería':'📝','Libros':'📚','Otro':'📦'
  };

  if(!prods.length){ el.innerHTML='<p style="color:#888;font-size:13px;padding:12px;">Sin productos registrados.</p>'; return; }

  var html = '';
  Object.keys(cats).forEach(function(cat){
    var icon = CAT_ICONS[cat]||'📦';
    html += '<div style="margin-bottom:16px;">'
      +'<div style="font-weight:700;font-size:13px;color:var(--navy);padding:6px 0;border-bottom:2px solid var(--border);margin-bottom:6px;">'+icon+' '+cat+'</div>'
      +'<table style="width:100%;border-collapse:collapse;font-size:12px;">'
      +'<thead><tr style="background:#f8fafc;">'
      +'<th style="padding:6px 8px;text-align:left;color:#555;">Nombre</th>'
      +'<th style="padding:6px 8px;text-align:center;color:#555;">Precio (RD$)</th>'
      +'<th style="padding:6px 8px;text-align:center;color:#555;">Costo (RD$)</th>'
      +'<th style="padding:6px 8px;text-align:center;color:#555;">Ganancia</th>'
      +'<th style="padding:6px 8px;text-align:center;color:#555;">Acciones</th>'
      +'</tr></thead><tbody>';

    cats[cat].forEach(function(p){
      var gan = p.precio>0 ? ((p.precio-p.costo)/p.precio*100).toFixed(0) : 0;
      var ganColor = (p.precio-p.costo)>0?'#16a34a':(p.precio-p.costo)<0?'#dc2626':'#888';
      html += '<tr style="border-bottom:1px solid #f0f0f0;" id="prod-row-'+p.id+'">'
        // Name (editable on click)
        +'<td style="padding:6px 8px;">'
        +'<div style="font-weight:600;" ondblclick="editProdField(\''+p.id+'\',\'nombre\',this)">'+p.nombre+'</div>'
        +(p.desc?'<div style="font-size:10px;color:#aaa;">'+p.desc+'</div>':'')
        +'</td>'
        // Price (inline editable)
        +'<td style="padding:6px 8px;text-align:center;">'
        +'<input type="number" value="'+p.precio+'" min="0" style="width:72px;text-align:center;border:1px solid #ddd;border-radius:6px;padding:3px 5px;font-size:12px;font-weight:700;color:#1d4ed8;" '
        +'onchange="updateProdField(\''+p.id+'\',\'precio\',this.value)" onblur="renderProductosList()">'
        +'</td>'
        // Cost (inline editable)
        +'<td style="padding:6px 8px;text-align:center;">'
        +'<input type="number" value="'+p.costo+'" min="0" style="width:72px;text-align:center;border:1px solid #ddd;border-radius:6px;padding:3px 5px;font-size:12px;color:#888;" '
        +'onchange="updateProdField(\''+p.id+'\',\'costo\',this.value)" onblur="renderProductosList()">'
        +'</td>'
        // Ganancia
        +'<td style="padding:6px 8px;text-align:center;font-weight:700;color:'+ganColor+';">'+gan+'%<div style="font-size:10px;color:'+ganColor+';">RD$ '+(p.precio-p.costo).toLocaleString()+'</div></td>'
        // Actions
        +'<td style="padding:6px 8px;text-align:center;white-space:nowrap;">'
        +'<button onclick="toggleProdActivo(\''+p.id+'\')" title="'+(p.activo===false?'Activar':'Desactivar')+'" style="background:none;border:none;cursor:pointer;font-size:15px;">'+(p.activo===false?'🔴':'🟢')+'</button>'
        +'<button onclick="deleteProducto(\''+p.id+'\')" title="Eliminar" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:15px;">🗑️</button>'
        +'</td></tr>';
    });

    html += '</tbody></table></div>';
  });

  // Summary footer
  var totalActivos = prods.filter(function(p){return p.activo!==false;}).length;
  var gananciaTotal = prods.reduce(function(a,p){return a+(p.precio-p.costo);},0);
  html += '<div style="background:#f0f4ff;border-radius:8px;padding:10px 14px;font-size:12px;color:#555;display:flex;gap:20px;flex-wrap:wrap;">'
    +'<span>📦 <b>'+prods.length+'</b> productos · <b>'+totalActivos+'</b> activos</span>'
    +'<span>💹 Ganancia total catálogo: <b style="color:#16a34a;">RD$ '+gananciaTotal.toLocaleString()+'</b></span>'
    +'<span style="color:#888;font-size:11px;">💡 Doble clic en el nombre para editarlo · Edita precios directamente en la tabla</span>'
    +'</div>';

  el.innerHTML = html;
}

function updateProdField(id, field, val){
  var p = (APP.productos||[]).find(function(x){return x.id===id;});
  if(!p) return;
  p[field] = field==='precio'||field==='costo' ? parseFloat(val)||0 : val;
  persistSave();
  // Don't re-render on every keystroke — only on blur (handled by onblur)
}

function editProdField(id, field, el){
  var p = (APP.productos||[]).find(function(x){return x.id===id;});
  if(!p) return;
  var cur = p[field]||'';
  var input = document.createElement('input');
  input.type='text'; input.value=cur;
  input.style.cssText='width:100%;border:1px solid var(--gold);border-radius:4px;padding:2px 6px;font-size:12px;font-weight:600;';
  el.replaceWith(input);
  input.focus(); input.select();
  function save(){
    p[field]=input.value.trim()||cur;
    persistSave();
    renderProductosList();
  }
  input.addEventListener('blur', save);
  input.addEventListener('keydown', function(e){ if(e.key==='Enter') save(); if(e.key==='Escape'){p[field]=cur;renderProductosList();} });
}

function toggleProdActivo(id){
  var p = (APP.productos||[]).find(function(x){return x.id===id;});
  if(!p) return;
  p.activo = (p.activo===false) ? true : false;
  persistSave();
  renderProductosList();
  toast((p.activo!==false?'✅ Producto activado':'🔴 Producto desactivado'),'info');
}

// Override openModal for modal-producto to render products list
var _origOpenModal = typeof openModal==='function' ? openModal : null;
if(_origOpenModal){
  var _patchedOpenModal = function(id){
    _origOpenModal(id);
    if(id==='modal-producto') renderProductosList();
    if(id==='modal-pago')     populatePagoTipoSelect();
  };
  window.openModal = _patchedOpenModal;
}

function populatePagoTipoSelect(){
  var sel = document.getElementById('pago-tipo');
  if(!sel) return;
  sel.innerHTML = '<option value="">Seleccionar concepto...</option>';
  (APP.productos||[]).forEach(function(p){
    var o = document.createElement('option');
    o.value = p.nombre;
    o.dataset.precio = p.precio;
    o.dataset.costo  = p.costo;
    o.textContent = p.cat+' — '+p.nombre+' (RD$ '+p.precio.toLocaleString()+')';
    sel.appendChild(o);
  });
}

function updatePagoMonto(){
  var sel = document.getElementById('pago-tipo');
  if(!sel) return;
  var opt = sel.options[sel.selectedIndex];
  if(opt && opt.dataset.precio){
    var montoEl = document.getElementById('pago-monto');
    var costoEl = document.getElementById('pago-costo');
    if(montoEl) montoEl.value = opt.dataset.precio;
    if(costoEl) costoEl.value = opt.dataset.costo;
    calcGanancia();
  }
}

function calcGanancia(){
  var monto = parseFloat((document.getElementById('pago-monto')||{}).value)||0;
  var costo = parseFloat((document.getElementById('pago-costo')||{}).value)||0;
  var el = document.getElementById('pago-ganancia-preview');
  if(!el) return;
  var gan = monto - costo;
  var pct = monto>0 ? ((gan/monto)*100).toFixed(1) : 0;
  el.textContent = 'RD$ '+gan.toLocaleString()+' ('+pct+'%)';
  el.style.color = gan>0 ? '#16a34a' : gan<0 ? '#dc2626' : '#888';
  el.style.background = gan>0 ? '#f0fdf4' : gan<0 ? '#fef2f2' : '#f9fafb';
  el.style.borderColor = gan>0 ? '#bbf7d0' : gan<0 ? '#fecaca' : '#e5e7eb';
}

// Patch savePago to include ganancia
var _origSavePago = savePago;
savePago = function(){
  // We need to add ganancia to the pago object — patch after push
  var estEmail = (document.getElementById('pago-estudiante')||{}).value||'';
  var monto    = parseFloat((document.getElementById('pago-monto')||{}).value)||0;
  var costo    = parseFloat((document.getElementById('pago-costo')||{}).value)||0;
  if(!estEmail||!monto){ toast('Complete todos los campos requeridos','error'); return; }
  var st = APP.students.find(function(s){return s.email===estEmail;});
  if(!st){ toast('Estudiante no encontrado','error'); return; }
  var pago = {
    id:'PAG-'+Date.now(),
    estudianteEmail:estEmail,
    estudianteNombre:st.nombre+' '+st.apellido,
    grado:st.grado,
    tipo:(document.getElementById('pago-tipo')||{}).value||'',
    mes:(document.getElementById('pago-mes')||{}).value||'',
    monto:monto,
    costo:costo,
    ganancia:monto-costo,
    estado:(document.getElementById('pago-estado')||{}).value||'Pagado',
    fecha:(document.getElementById('pago-fecha')||{}).value||new Date().toISOString().split('T')[0],
    metodo:(document.getElementById('pago-metodo')||{}).value||'Efectivo',
    notas:(document.getElementById('pago-notas')||{}).value||'',
    fechaRegistro:new Date().toLocaleDateString('es-DO')
  };
  APP.pagos.push(pago);
  persistSave();
  closeModal('modal-pago');
  renderPagos();
  if(st.emailPadre) addNotifToUser(st.emailPadre,'💰 '+pago.tipo+': RD$ '+monto.toLocaleString()+' — '+pago.estado);
  toast('✅ Venta/Pago registrado · Ganancia: RD$ '+(monto-costo).toLocaleString(),'success');
  logAudit('pago','Pago: '+pago.estudianteNombre+' — '+pago.tipo+' RD$'+monto+' (gan: RD$'+(monto-costo)+')');
};

if(PERSIST_KEYS.indexOf('productos')===-1) PERSIST_KEYS.push('productos');

// ================================================================
//  📈 ESTADÍSTICAS GENERALES
// ================================================================
function showEstadTab(id, btn){
  document.querySelectorAll('.estad-tab-pane').forEach(function(el){el.style.display='none';});
  var panel = document.getElementById(id); if(panel) panel.style.display='block';
  document.querySelectorAll('#dash-estadisticas .cfg-tab').forEach(function(b){b.classList.remove('active');});
  if(btn) btn.classList.add('active');
  renderEstadSubSection(id);
}

function renderEstadisticas(){
  renderEstadSubSection('estad-academico');
}

function renderEstadSubSection(id){
  var notas = APP.notas||[];
  var students = APP.students||[];
  var ausencias = APP.ausencias||[];
  var pagos = APP.pagos||[];

  if(id==='estad-academico'){
    var promedioGeneral = notas.length ? (notas.reduce(function(a,n){return a+Number(n.calificacion||0);},0)/notas.length).toFixed(1) : 0;
    var aprobados = students.filter(function(s){
      var sns = notas.filter(function(n){return n.email===s.email;});
      if(!sns.length) return false;
      return sns.reduce(function(a,n){return a+Number(n.calificacion||0);},0)/sns.length >= 70;
    }).length;
    kpiCards('estad-kpis-academico',[
      {icon:'📊',label:'Promedio General',val:promedioGeneral,color:'#2563eb',bg:'#dbeafe'},
      {icon:'✅',label:'Aprobados',val:aprobados,color:'#16a34a',bg:'#dcfce7'},
      {icon:'❌',label:'Reprobados',val:students.length-aprobados,color:'#dc2626',bg:'#fee2e2'},
      {icon:'📋',label:'Notas registradas',val:notas.length,color:'#7c3aed',bg:'#ede9fe'},
    ]);
    // Top students
    var top = students.map(function(s){
      var sns=notas.filter(function(n){return n.email===s.email;});
      var avg=sns.length?sns.reduce(function(a,n){return a+Number(n.calificacion||0);},0)/sns.length:null;
      return {nombre:s.nombre+' '+s.apellido,grado:s.grado,avg:avg};
    }).filter(function(s){return s.avg!==null;}).sort(function(a,b){return b.avg-a.avg;});
    var topEl=document.getElementById('estad-top-students');
    if(topEl) topEl.innerHTML = top.slice(0,8).map(function(s,i){
      var medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'  '+(i+1)+'.';
      var c=s.avg>=90?'#16a34a':s.avg>=80?'#2563eb':s.avg>=70?'#d97706':'#dc2626';
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;margin-bottom:5px;background:white;border:1px solid var(--border);">'
        +'<span style="font-size:16px;min-width:26px;">'+medal+'</span>'
        +'<div style="flex:1;"><div style="font-weight:600;font-size:13px;">'+s.nombre+'</div><div style="font-size:11px;color:#888;">'+s.grado+'</div></div>'
        +'<span style="font-weight:800;font-size:15px;color:'+c+';">'+s.avg.toFixed(1)+'</span>'
        +'</div>';
    }).join('') || '<p style="color:#888;font-size:13px;padding:10px;">Sin datos.</p>';
    // By grade
    var grades={};
    top.forEach(function(s){if(!grades[s.grado]){grades[s.grado]={sum:0,n:0};}grades[s.grado].sum+=s.avg;grades[s.grado].n++;});
    var gradoEl=document.getElementById('estad-por-grado');
    if(gradoEl) gradoEl.innerHTML=Object.keys(grades).sort().map(function(g){
      var avg=grades[g].sum/grades[g].n;
      var c=avg>=90?'#16a34a':avg>=80?'#2563eb':avg>=70?'#d97706':'#dc2626';
      return '<div style="margin-bottom:10px;">'
        +'<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;"><span style="font-weight:600;">'+g+' ('+grades[g].n+')</span><span style="font-weight:700;color:'+c+';">'+avg.toFixed(1)+'</span></div>'
        +'<div style="height:8px;background:#f0f0f0;border-radius:4px;"><div style="height:100%;width:'+Math.min(100,avg)+'%;background:'+c+';border-radius:4px;"></div></div>'
        +'</div>';
    }).join('') || '<p style="color:#888;font-size:13px;">Sin datos.</p>';
    // By subject
    var materias={};
    notas.forEach(function(n){if(!materias[n.materia]){materias[n.materia]={sum:0,cnt:0};}materias[n.materia].sum+=Number(n.calificacion||0);materias[n.materia].cnt++;});
    var matEl=document.getElementById('estad-por-materia');
    if(matEl) matEl.innerHTML = Object.keys(materias).length
      ? '<div style="display:flex;flex-wrap:wrap;gap:8px;">'+Object.keys(materias).sort().map(function(m){
          var avg=materias[m].sum/materias[m].cnt;
          var c=avg>=90?'#16a34a':avg>=80?'#2563eb':avg>=70?'#d97706':'#dc2626';
          return '<div style="padding:8px 14px;border-radius:10px;background:white;border:1px solid var(--border);font-size:13px;">'
            +'<span style="font-weight:600;">'+m+'</span> <span style="font-weight:700;color:'+c+';">'+avg.toFixed(1)+'</span>'
            +'</div>';
        }).join('')+'</div>'
      : '<p style="color:#888;font-size:13px;padding:10px;">Sin datos de materias.</p>';
  }
  else if(id==='estad-asistencia'){
    var totalDias = 180; var totalEst = students.length||1;
    var tasaGlobal = Math.max(0,(100 - (ausencias.length/(totalEst*totalDias)*100))).toFixed(1);
    kpiCards('estad-kpis-asistencia',[
      {icon:'✅',label:'Tasa de Asistencia',val:tasaGlobal+'%',color:'#16a34a',bg:'#dcfce7'},
      {icon:'❌',label:'Total Ausencias',val:ausencias.length,color:'#dc2626',bg:'#fee2e2'},
      {icon:'📅',label:'Promedio ausencias/est.',val:(ausencias.length/totalEst).toFixed(1),color:'#d97706',bg:'#fef3c7'},
    ]);
    // Chart by month
    var meses=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    var ausPorMes=Array(12).fill(0);
    ausencias.forEach(function(a){ var d=new Date(a.fecha||a.date||''); if(!isNaN(d)) ausPorMes[d.getMonth()]++; });
    var maxAus=Math.max(1,...ausPorMes);
    var chartEl=document.getElementById('estad-aus-chart');
    if(chartEl) chartEl.innerHTML='<div style="display:flex;gap:6px;align-items:flex-end;height:100%;width:100%;">'+ausPorMes.map(function(v,i){
      var h=Math.max(4,Math.round((v/maxAus)*100));
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;">'
        +'<span style="font-size:10px;font-weight:700;color:#ef4444;">'+v+'</span>'
        +'<div style="width:100%;background:#ef4444;border-radius:4px 4px 0 0;height:'+h+'px;"></div>'
        +'<span style="font-size:9px;color:#888;">'+meses[i]+'</span>'
        +'</div>';
    }).join('')+'</div>';
    // Top absent students
    var ausPorEst={};
    ausencias.forEach(function(a){ausPorEst[a.email]=(ausPorEst[a.email]||0)+1;});
    var topAus=Object.keys(ausPorEst).map(function(e){
      var s=students.find(function(st){return st.email===e;});
      return {nombre:s?s.nombre+' '+s.apellido:e,grado:s?s.grado:'—',count:ausPorEst[e]};
    }).sort(function(a,b){return b.count-a.count;}).slice(0,8);
    var ausTopEl=document.getElementById('estad-aus-top');
    if(ausTopEl) ausTopEl.innerHTML=topAus.length?topAus.map(function(s,i){
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;margin-bottom:5px;background:white;border:1px solid var(--border);">'
        +'<span style="font-size:18px;font-weight:700;color:#ef4444;min-width:26px;">'+(i+1)+'</span>'
        +'<div style="flex:1;"><div style="font-weight:600;font-size:13px;">'+s.nombre+'</div><div style="font-size:11px;color:#888;">'+s.grado+'</div></div>'
        +'<span style="font-weight:700;color:#ef4444;">'+s.count+' aus.</span>'
        +'</div>';
    }).join(''):'<p style="color:#888;font-size:13px;padding:10px;">Sin ausencias registradas.</p>';
  }
  else if(id==='estad-finanzas'){
    var totalCobrado=pagos.reduce(function(a,p){return a+(p.estado==='Pagado'?+p.monto:0);},0);
    var totalGanancia=pagos.reduce(function(a,p){return a+(p.estado==='Pagado'?+(p.ganancia||0):0);},0);
    var pendiente=pagos.reduce(function(a,p){return a+(p.estado!=='Pagado'?+p.monto:0);},0);
    var margen=totalCobrado>0?(totalGanancia/totalCobrado*100).toFixed(1):0;
    kpiCards('estad-kpis-finanzas',[
      {icon:'💵',label:'Total Cobrado',val:'RD$ '+totalCobrado.toLocaleString(),color:'#16a34a',bg:'#dcfce7'},
      {icon:'💹',label:'Ganancia Total',val:'RD$ '+totalGanancia.toLocaleString(),color:'#2563eb',bg:'#dbeafe'},
      {icon:'📊',label:'Margen Ganancia',val:margen+'%',color:'#7c3aed',bg:'#ede9fe'},
      {icon:'⏳',label:'Pendiente',val:'RD$ '+pendiente.toLocaleString(),color:'#d97706',bg:'#fef3c7'},
    ]);
    // By tipo
    var tipoMap={};
    pagos.forEach(function(p){if(p.estado==='Pagado'){if(!tipoMap[p.tipo]){tipoMap[p.tipo]={total:0,gan:0};}tipoMap[p.tipo].total+=+p.monto;tipoMap[p.tipo].gan+=+(p.ganancia||0);}});
    var tipoEl=document.getElementById('estad-ventas-tipo');
    if(tipoEl) tipoEl.innerHTML=Object.keys(tipoMap).length?
      Object.keys(tipoMap).sort(function(a,b){return tipoMap[b].total-tipoMap[a].total;}).map(function(t){
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;margin-bottom:6px;background:white;border:1px solid var(--border);">'
          +'<div style="flex:1;font-weight:600;font-size:13px;">'+t+'</div>'
          +'<div style="text-align:right;"><div style="font-weight:700;color:#1d4ed8;font-size:13px;">RD$ '+tipoMap[t].total.toLocaleString()+'</div>'
          +'<div style="font-size:11px;color:#16a34a;">+RD$ '+tipoMap[t].gan.toLocaleString()+'</div></div>'
          +'</div>';
      }).join(''):'<p style="color:#888;font-size:13px;padding:10px;">Sin ventas registradas.</p>';
    // By month
    var mesMap={};
    pagos.forEach(function(p){if(p.estado==='Pagado'&&p.mes){if(!mesMap[p.mes])mesMap[p.mes]=0;mesMap[p.mes]+=+p.monto;}});
    var mesesOrder=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    var mesEl=document.getElementById('estad-ingresos-mes');
    if(mesEl) mesEl.innerHTML=Object.keys(mesMap).length?
      mesesOrder.filter(function(m){return mesMap[m];}).map(function(m){
        var w=Math.min(100,(mesMap[m]/(Math.max(...Object.values(mesMap)))*100));
        return '<div style="margin-bottom:8px;">'
          +'<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;"><span>'+m+'</span><span style="font-weight:700;color:#1d4ed8;">RD$ '+mesMap[m].toLocaleString()+'</span></div>'
          +'<div style="height:8px;background:#f0f0f0;border-radius:4px;"><div style="height:100%;width:'+w+'%;background:#3b82f6;border-radius:4px;"></div></div>'
          +'</div>';
      }).join(''):'<p style="color:#888;font-size:13px;padding:10px;">Sin ingresos registrados.</p>';
  }
  else if(id==='estad-estudiantes'){
    kpiCards('estad-kpis-est',[
      {icon:'🎓',label:'Total Estudiantes',val:students.length,color:'#2563eb',bg:'#dbeafe'},
      {icon:'👪',label:'Padres registrados',val:(APP.padres||[]).length,color:'#16a34a',bg:'#dcfce7'},
      {icon:'📝',label:'Inscripciones',val:(APP.inscripciones||[]).length,color:'#7c3aed',bg:'#ede9fe'},
    ]);
    var grades={};
    students.forEach(function(s){grades[s.grado]=(grades[s.grado]||0)+1;});
    var distEl=document.getElementById('estad-dist-grado');
    if(distEl) distEl.innerHTML=Object.keys(grades).length?
      Object.keys(grades).sort().map(function(g){
        var w=Math.min(100,(grades[g]/students.length*100));
        return '<div style="margin-bottom:8px;">'
          +'<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;"><span style="font-weight:600;">'+g+'</span><span style="font-weight:700;">'+grades[g]+'</span></div>'
          +'<div style="height:8px;background:#f0f0f0;border-radius:4px;"><div style="height:100%;width:'+w+'%;background:var(--navy);border-radius:4px;"></div></div>'
          +'</div>';
      }).join(''):'<p style="color:#888;font-size:13px;padding:10px;">Sin estudiantes.</p>';
    // Gender distribution (based on name heuristic — just shows M/F split)
    var genderEl=document.getElementById('estad-dist-genero');
    if(genderEl) genderEl.innerHTML='<div style="padding:16px;background:#f8fafc;border-radius:10px;text-align:center;color:#888;font-size:13px;">Para distribución de género agregue un campo de género al registro de estudiantes.</div>';
  }
}

function kpiCards(containerId, cards){
  var el=document.getElementById(containerId);
  if(!el) return;
  el.innerHTML=cards.map(function(k){
    return '<div style="background:'+k.bg+';border-radius:12px;padding:14px 16px;text-align:center;">'
      +'<div style="font-size:24px;">'+k.icon+'</div>'
      +'<div style="font-size:20px;font-weight:800;color:'+k.color+';">'+k.val+'</div>'
      +'<div style="font-size:12px;color:#555;">'+k.label+'</div>'
      +'</div>';
  }).join('');
}

function exportEstadisticasPDF(){
  window.print();
}

// ================================================================
//  🪪 CARNET DIGITAL CON QR
// ================================================================
// Load QRCode library dynamically if not present
function loadQRLib(cb){
  if(typeof QRCode!=='undefined'){ cb(); return; }
  var s=document.createElement('script');
  s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  s.onload=cb;
  document.head.appendChild(s);
}

function renderCarnetAdmin(){
  var search = ((document.getElementById('carnet-search')||{}).value||'').toLowerCase();
  var gradoFilter = (document.getElementById('carnet-grado')||{}).value||'';

  // Populate grado filter
  var gradoSel = document.getElementById('carnet-grado');
  if(gradoSel && gradoSel.options.length<=1){
    var grades=[...new Set((APP.students||[]).map(function(s){return s.grado;}))].sort();
    grades.forEach(function(g){var o=document.createElement('option');o.value=g;o.textContent=g;gradoSel.appendChild(o);});
  }

  var students = (APP.students||[]).filter(function(s){
    var nombre=(s.nombre+' '+s.apellido).toLowerCase();
    return (!search||nombre.includes(search)) && (!gradoFilter||s.grado===gradoFilter);
  });

  var grid = document.getElementById('carnets-grid');
  if(!grid) return;
  if(!students.length){ grid.innerHTML='<p style="color:#888;padding:20px;text-align:center;">No hay estudiantes registrados.</p>'; return; }

  grid.innerHTML = students.map(function(s){
    var qrData = 'ID:'+s.id+'|NOMBRE:'+s.nombre+' '+s.apellido+'|GRADO:'+s.grado+'|CENTRO:C.E. Otilia Pelaez|AÑO:2025-2026';
    return '<div class="carnet-card" id="carnet-'+s.id+'" style="background:white;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1);border:2px solid var(--border);">'
      // Header
      +'<div style="background:linear-gradient(135deg,var(--navy),#0f3460);padding:12px 16px;display:flex;align-items:center;gap:10px;">'
      +'<div style="font-size:28px;">🏫</div>'
      +'<div><div style="color:white;font-weight:800;font-size:12px;">C.E. OTILIA PELÁEZ</div>'
      +'<div style="color:rgba(255,255,255,.7);font-size:10px;">Sabana Perdida · Dto. 10-02</div></div>'
      +'<div style="margin-left:auto;background:var(--gold);color:var(--navy);font-size:9px;font-weight:700;padding:2px 8px;border-radius:12px;">2025-2026</div>'
      +'</div>'
      // Body
      +'<div style="padding:16px;display:flex;gap:14px;align-items:flex-start;">'
      // Photo
      +'<div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#e8f4fd,#c3ddf9);display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;border:3px solid var(--border);">'+(s.foto?'<img src="'+s.foto+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">':'🎓')+'</div>'
      // Info
      +'<div style="flex:1;min-width:0;">'
      +'<div style="font-weight:800;font-size:15px;color:var(--navy);line-height:1.2;">'+s.nombre+'<br>'+s.apellido+'</div>'
      +'<div style="font-size:12px;color:#555;margin-top:4px;">📚 '+s.grado+'</div>'
      +'<div style="font-size:11px;color:#888;">ID: '+s.id+'</div>'
      +(s.carrera?'<div style="font-size:11px;color:var(--gold);font-weight:600;">🎓 '+s.carrera+'</div>':'')
      +'</div>'
      // QR placeholder
      +'<div id="qr-'+s.id+'" style="width:60px;height:60px;flex-shrink:0;"></div>'
      +'</div>'
      // Footer
      +'<div style="background:#f8fafc;padding:8px 16px;display:flex;justify-content:space-between;align-items:center;">'
      +'<span style="font-size:10px;color:#888;">Este carnet es propiedad del centro</span>'
      +'<button onclick="printCarnet(\''+s.id+'\')" style="background:var(--navy);border:none;color:white;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;">🖨️ Imprimir</button>'
      +'</div>'
      +'</div>';
  }).join('');

  // Generate QR codes
  loadQRLib(function(){
    students.forEach(function(s){
      var qrEl = document.getElementById('qr-'+s.id);
      if(qrEl && qrEl.innerHTML===''){
        try{
          new QRCode(qrEl,{
            text:'C.E. Otilia Pelaez|'+s.id+'|'+s.nombre+' '+s.apellido+'|'+s.grado,
            width:60, height:60,
            colorDark:'#16213e', colorLight:'#ffffff',
            correctLevel:QRCode.CorrectLevel.M
          });
        }catch(e){}
      }
    });
  });
}

function printCarnet(id){
  var card = document.getElementById('carnet-'+id);
  if(!card) return;
  var w = window.open('','_blank','width=400,height=300');
  w.document.write('<!DOCTYPE html><html><head><title>Carnet</title>'
    +'<style>body{margin:0;font-family:Arial,sans-serif;} @media print{body{margin:0;}}</style>'
    +'</head><body>'+card.outerHTML
    +'<script>window.onload=function(){window.print();window.close();}<\/script></body></html>');
  w.document.close();
}

function printAllCarnets(){
  var all = document.getElementById('carnets-grid');
  if(!all||!all.innerHTML.trim()){toast('Primero carga los carnets','error');return;}
  var w = window.open('','_blank');
  w.document.write('<!DOCTYPE html><html><head><title>Carnets</title>'
    +'<style>body{font-family:Arial,sans-serif;padding:20px;} .carnet-card{display:inline-block;width:280px;margin:8px;page-break-inside:avoid;} @media print{.carnet-card{page-break-inside:avoid;}}</style>'
    +'</head><body>'+all.innerHTML
    +'<script>window.onload=function(){window.print();}<\/script></body></html>');
  w.document.close();
}

// ================================================================
//  📡 REPORTES MINERD
// ================================================================
var MINERD_REPORTES = [
  {id:'matricula',icon:'🎓',titulo:'Acta de Matrícula',desc:'Lista oficial de estudiantes matriculados por grado, conforme al formato 002-A del MINERD.'},
  {id:'asistencia',icon:'📅',titulo:'Reporte de Asistencia',desc:'Consolidado mensual de asistencia por aula. Formato oficial para entrega al Distrito 10-02.'},
  {id:'calificaciones',icon:'📊',titulo:'Boletín de Calificaciones',desc:'Notas por trimestre en formato oficial. Incluye promedio, observaciones y firma del maestro.'},
  {id:'repitencia',icon:'🔄',titulo:'Índice de Repitencia',desc:'Porcentaje de repitencia por grado. Indicador requerido por el Plan Estratégico MINERD 2030.'},
  {id:'desercion',icon:'⚠️',titulo:'Reporte de Deserción',desc:'Estudiantes que abandonaron en el año en curso con datos de causa y seguimiento.'},
  {id:'docentes',icon:'👨‍🏫',titulo:'Nómina de Docentes',desc:'Lista de maestros activos con carga horaria, área y nivel. Formato Ley 41-00.'},
  {id:'estadistica_general',icon:'📈',titulo:'Estadística General del Centro',desc:'Resumen anual completo para la Dirección Regional 10 y el MINERD central.'},
  {id:'infraestructura',icon:'🏫',titulo:'Estado de Infraestructura',desc:'Inventario de aulas, mobiliario y estado general del plantel. Requerido anualmente.'},
];

function renderMinerd(){
  var grid = document.getElementById('minerd-reportes-grid');
  if(!grid) return;
  grid.innerHTML = MINERD_REPORTES.map(function(r){
    return '<div style="background:white;border:1px solid var(--border);border-radius:12px;padding:16px;cursor:pointer;transition:.2s;" '
      +'onmouseover="this.style.boxShadow=\'0 4px 16px rgba(0,0,0,.1)\'" onmouseout="this.style.boxShadow=\'none\'" '
      +'onclick="generateMinerdReport(\''+r.id+'\')">'
      +'<div style="font-size:28px;margin-bottom:8px;">'+r.icon+'</div>'
      +'<div style="font-weight:700;font-size:14px;color:var(--navy);margin-bottom:4px;">'+r.titulo+'</div>'
      +'<div style="font-size:12px;color:#666;line-height:1.4;">'+r.desc+'</div>'
      +'<div style="margin-top:10px;"><span style="font-size:11px;color:white;background:var(--navy);padding:3px 10px;border-radius:12px;">📄 Generar</span></div>'
      +'</div>';
  }).join('');
}

function generateMinerdReport(tipo){
  var preview = document.getElementById('minerd-preview');
  var content = document.getElementById('minerd-report-content');
  if(!preview||!content) return;

  var codigo = (document.getElementById('minerd-codigo')||{}).value||'1002XXX';
  var fecha  = new Date().toLocaleDateString('es-DO',{day:'2-digit',month:'long',year:'numeric'});
  var students = APP.students||[];
  var notas    = APP.notas||[];

  var html = '';
  var reportInfo = MINERD_REPORTES.find(function(r){return r.id===tipo;});

  // Common header
  var header = '<div style="text-align:center;border-bottom:2px solid #16213e;padding-bottom:12px;margin-bottom:16px;">'
    +'<div style="font-weight:800;font-size:15px;color:#16213e;">MINISTERIO DE EDUCACIÓN DE LA REPÚBLICA DOMINICANA</div>'
    +'<div style="font-size:13px;color:#555;">DIRECCIÓN REGIONAL 10 · DISTRITO EDUCATIVO 10-02</div>'
    +'<div style="font-size:16px;font-weight:700;color:#16213e;margin-top:8px;">'+(reportInfo?reportInfo.titulo.toUpperCase():'REPORTE')+'</div>'
    +'<div style="font-size:12px;color:#888;margin-top:4px;">'
    +'Centro: C.E. Otilia Peláez &nbsp;|&nbsp; Código: '+codigo+' &nbsp;|&nbsp; Fecha: '+fecha
    +'</div></div>';

  if(tipo==='matricula'){
    var grades=[...new Set(students.map(function(s){return s.grado;}))].sort();
    var rows = grades.map(function(g){
      var cnt=students.filter(function(s){return s.grado===g;}).length;
      return '<tr style="border-bottom:1px solid #eee;">'
        +'<td style="padding:6px 10px;">'+g+'</td>'
        +'<td style="padding:6px 10px;text-align:center;">'+cnt+'</td>'
        +'<td style="padding:6px 10px;text-align:center;">—</td>'
        +'<td style="padding:6px 10px;text-align:center;">—</td>'
        +'<td style="padding:6px 10px;text-align:center;font-weight:700;">'+cnt+'</td>'
        +'</tr>';
    }).join('');
    html = header
      +'<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">'
      +'<thead><tr style="background:#16213e;color:white;">'
      +'<th style="padding:8px 10px;text-align:left;">Grado/Nivel</th>'
      +'<th style="padding:8px 10px;">Matrícula Total</th>'
      +'<th style="padding:8px 10px;">Masculino</th>'
      +'<th style="padding:8px 10px;">Femenino</th>'
      +'<th style="padding:8px 10px;">Total</th>'
      +'</tr></thead><tbody>'+rows+'</tbody>'
      +'<tfoot><tr style="background:#f0f4ff;font-weight:700;">'
      +'<td style="padding:8px 10px;">TOTAL GENERAL</td>'
      +'<td style="padding:8px 10px;text-align:center;" colspan="3">'+students.length+'</td>'
      +'<td style="padding:8px 10px;text-align:center;">'+students.length+'</td>'
      +'</tr></tfoot>'
      +'</table>'
      +'<div style="display:flex;justify-content:space-between;margin-top:40px;font-size:12px;">'
      +'<div style="text-align:center;"><div style="border-top:1px solid #333;padding-top:4px;width:180px;">Directora del Centro</div><div>Sor Cesarina A. Paulino Fernández</div></div>'
      +'<div style="text-align:center;"><div style="border-top:1px solid #333;padding-top:4px;width:180px;">Director/a Distrital</div><div>Distrito Educativo 10-02</div></div>'
      +'</div>';
  }
  else if(tipo==='calificaciones'){
    var rows2 = students.slice(0,20).map(function(s,i){
      var sns=notas.filter(function(n){return n.email===s.email;});
      var avg=sns.length?(sns.reduce(function(a,n){return a+Number(n.calificacion||0);},0)/sns.length).toFixed(1):'—';
      return '<tr style="border-bottom:1px solid #eee;">'
        +'<td style="padding:5px 8px;">'+(i+1)+'</td>'
        +'<td style="padding:5px 8px;">'+s.nombre+' '+s.apellido+'</td>'
        +'<td style="padding:5px 8px;text-align:center;">'+s.grado+'</td>'
        +'<td style="padding:5px 8px;text-align:center;">'+avg+'</td>'
        +'<td style="padding:5px 8px;text-align:center;">'+(avg!=='—'&&parseFloat(avg)>=70?'<span style="color:#16a34a;font-weight:700;">Aprobado</span>':'<span style="color:#dc2626;font-weight:700;">Reprobado</span>')+'</td>'
        +'</tr>';
    }).join('');
    html = header
      +'<p style="font-size:12px;color:#888;margin-bottom:8px;">Trimestre: 2do Trimestre · Año Escolar 2025-2026</p>'
      +'<table style="width:100%;border-collapse:collapse;font-size:12px;">'
      +'<thead><tr style="background:#16213e;color:white;">'
      +'<th style="padding:7px 8px;">#</th><th style="padding:7px 8px;text-align:left;">Nombre</th><th style="padding:7px 8px;">Grado</th><th style="padding:7px 8px;">Promedio</th><th style="padding:7px 8px;">Estado</th>'
      +'</tr></thead><tbody>'+rows2+'</tbody></table>'
      +(students.length>20?'<p style="font-size:11px;color:#888;margin-top:8px;">Mostrando primeros 20 de '+students.length+' estudiantes.</p>':'');
  }
  else if(tipo==='estadistica_general'){
    var prom=notas.length?(notas.reduce(function(a,n){return a+Number(n.calificacion||0);},0)/notas.length).toFixed(1):0;
    var totCobrado=(APP.pagos||[]).reduce(function(a,p){return a+(p.estado==='Pagado'?+p.monto:0);},0);
    html = header
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:13px;">'
      +'<div style="background:#f0f4ff;border-radius:8px;padding:12px;"><b>Matrícula total:</b> '+students.length+' estudiantes<br>'
      +'<b>Docentes:</b> '+(APP.profesores&&APP.profesores.length?APP.profesores.length:1)+' maestro(s)<br>'
      +'<b>Promedio general:</b> '+prom+'<br>'
      +'<b>Total ausencias:</b> '+(APP.ausencias||[]).length+'</div>'
      +'<div style="background:#f0fdf4;border-radius:8px;padding:12px;"><b>Total cobrado:</b> RD$ '+totCobrado.toLocaleString()+'<br>'
      +'<b>Anuncios publicados:</b> '+(APP.announcements||[]).length+'<br>'
      +'<b>Inscripciones:</b> '+(APP.inscripciones||[]).length+'<br>'
      +'<b>Padres registrados:</b> '+(APP.padres||[]).length+'</div>'
      +'</div>';
  }
  else {
    html = header + '<div style="padding:20px;text-align:center;color:#888;font-size:13px;">Reporte <b>'+(reportInfo?reportInfo.titulo:'')+'</b> generado. Complete los datos del centro y presione Imprimir para obtener el documento oficial.</div>';
  }

  content.innerHTML = html;
  preview.style.display = 'block';
  preview.scrollIntoView({behavior:'smooth', block:'start'});
}

function printMinerdReport(){
  var c = document.getElementById('minerd-report-content');
  if(!c) return;
  var w = window.open('','_blank','width=800,height=600');
  w.document.write('<!DOCTYPE html><html><head><title>Reporte MINERD</title>'
    +'<style>body{font-family:Arial,sans-serif;padding:20px;max-width:760px;margin:0 auto;font-size:12px;} @media print{body{padding:10px;}}</style>'
    +'</head><body>'+c.innerHTML
    +'<script>window.onload=function(){window.print();}<\/script></body></html>');
  w.document.close();
}

if(PERSIST_KEYS.indexOf('productos')===-1) PERSIST_KEYS.push('productos');

// ================================================================
//  🏥 ENFERMERÍA — Rol, login, panel y bot
// ================================================================

// ── Account & data init ───────────────────────────────────────────
// [enfermeria account defined in APP init]
if(!APP.consultas)  APP.consultas  = [];
if(!APP.stockEnfer) APP.stockEnfer = [
  {id:'S001',nombre:'Paracetamol 500mg',    cat:'Analgésico',       cantidad:30, unidad:'tabletas', vence:'2026-12-01',minimo:10},
  {id:'S002',nombre:'Ibuprofeno 400mg',     cat:'Antiinflamatorio', cantidad:20, unidad:'tabletas', vence:'2026-10-01',minimo:5},
  {id:'S003',nombre:'Amoxicilina 500mg',    cat:'Antibiótico',      cantidad:15, unidad:'cápsulas', vence:'2026-08-01',minimo:5},
  {id:'S004',nombre:'Loratadina 10mg',      cat:'Antihistamínico',  cantidad:25, unidad:'tabletas', vence:'2027-01-01',minimo:5},
  {id:'S005',nombre:'Alcohol isopropílico', cat:'Antiséptico',      cantidad:3,  unidad:'frascos',  vence:'2027-06-01',minimo:2},
  {id:'S006',nombre:'Agua oxigenada',       cat:'Antiséptico',      cantidad:4,  unidad:'frascos',  vence:'2027-04-01',minimo:2},
  {id:'S007',nombre:'Gasas estériles',      cat:'Material de cura', cantidad:50, unidad:'piezas',   vence:'2028-01-01',minimo:20},
  {id:'S008',nombre:'Esparadrapo',          cat:'Material de cura', cantidad:5,  unidad:'rollos',   vence:'2028-01-01',minimo:2},
  {id:'S009',nombre:'Guantes de látex',     cat:'Equipo',           cantidad:40, unidad:'pares',    vence:'2027-12-01',minimo:10},
  {id:'S010',nombre:'Termómetro digital',   cat:'Equipo',           cantidad:2,  unidad:'piezas',   vence:'',          minimo:1},
  {id:'S011',nombre:'Tensiómetro',          cat:'Equipo',           cantidad:1,  unidad:'piezas',   vence:'',          minimo:1},
  {id:'S012',nombre:'Sales de rehidratación',cat:'Otro',            cantidad:10, unidad:'sobres',   vence:'2026-11-01',minimo:5},
];
if(PERSIST_KEYS.indexOf('consultas') ===-1) PERSIST_KEYS.push('consultas');
if(PERSIST_KEYS.indexOf('stockEnfer')===-1) PERSIST_KEYS.push('stockEnfer');
if(PERSIST_KEYS.indexOf('accounts')  ===-1) PERSIST_KEYS.push('accounts');

// ── Login detection ───────────────────────────────────────────────
// [enfermeria login handled in doLogin + loginAs directly]

// ── showPage extension ────────────────────────────────────────────
// Add 'enfermeria' to portal icon map
// [showPortalFab enfermeria handled inline]

// [goToPortal enfermeria handled inline]

// [enfermeria showPage handled inline]

// ── Patch showAllBotFabs to include enfer ────────────────────────
var _sabfOrig = showAllBotFabs;
showAllBotFabs = function(show){
  _sabfOrig(show);
  var el = document.getElementById('bot-fab-enfer');
  if(el) el.style.display = 'none'; // Always hide in bulk-hide; shown selectively
};

// ── Section navigation ────────────────────────────────────────────
function showEnferSection(id){
  // Usa el mismo patrón que showProfeSection / showDashSection
  document.querySelectorAll('#page-enfermeria .dash-section').forEach(function(el){
    el.classList.remove('active');
  });
  var sec = document.getElementById(id);
  if(sec) sec.classList.add('active');
  // Actualizar tab activo
  document.querySelectorAll('#page-enfermeria .dash-tab').forEach(function(t){ t.classList.remove('active'); });
  var tabMap = {
    'enfer-inicio':'enfer-tab-inicio',
    'enfer-registros':'enfer-tab-registros',
    'enfer-buscar':'enfer-tab-estudiantes',
    'enfer-estadisticas':'enfer-tab-stats',
    'enfer-stock':'enfer-tab-stock',
    'enfer-perfil':'enfer-tab-perfil'
  };
  var tab = document.getElementById(tabMap[id]);
  if(tab) tab.classList.add('active');
}

// ── Populate student dropdown ─────────────────────────────────────
function populateConsultaEstSelect(){
  var sel = document.getElementById('consulta-estudiante');
  if(!sel || sel.options.length > 1) return;
  (APP.students||[]).forEach(function(s){
    var o = document.createElement('option');
    o.value = s.email;
    o.textContent = s.nombre+' '+s.apellido+' — '+s.grado;
    sel.appendChild(o);
  });
}

function loadDatosEstEnfer(){
  var email = (document.getElementById('consulta-estudiante')||{}).value;
  var box = document.getElementById('consulta-datos-est');
  if(!email){ if(box) box.style.display='none'; return; }
  var st = (APP.students||[]).find(function(s){ return s.email===email; });
  if(!st){ if(box) box.style.display='none'; return; }
  // Get padre info
  var padre = (APP.padres||[]).find(function(p){ return p.email===st.emailPadre; });
  var telPadre = st.telPadre || (padre && padre.telefono) || '—';
  var nombrePadre = padre ? padre.nombre+' '+padre.apellido : (st.emailPadre||'—');
  // Count previous visits
  var visitas = (APP.consultas||[]).filter(function(c){ return c.email===email; }).length;
  document.getElementById('ce-grado').textContent   = st.grado||'—';
  document.getElementById('ce-tel').textContent     = telPadre;
  document.getElementById('ce-padre').textContent   = nombrePadre;
  document.getElementById('ce-visitas').textContent = visitas+' visita(s)';
  var telLink = document.getElementById('ce-tel-link');
  if(telLink){ telLink.href='tel:'+telPadre.replace(/\D/g,''); telLink.textContent='📞 Llamar: '+telPadre; }
  if(box) box.style.display='block';
  // Set default time
  var hora = document.getElementById('consulta-hora');
  if(hora && !hora.value) hora.value = new Date().toTimeString().slice(0,5);
}

// ── Save consulta ─────────────────────────────────────────────────
function saveConsulta(){
  var email   = (document.getElementById('consulta-estudiante')||{}).value;
  var motivo  = (document.getElementById('consulta-motivo')    ||{}).value;
  var estado  = (document.getElementById('consulta-estado')    ||{}).value;
  if(!email||!motivo){ toast('Estudiante y motivo son obligatorios','error'); return; }
  var st = (APP.students||[]).find(function(s){ return s.email===email; });
  var padre = st ? (APP.padres||[]).find(function(p){ return p.email===st.emailPadre; }) : null;
  var consulta = {
    id:'C-'+Date.now(),
    email:email,
    nombre: st ? st.nombre+' '+st.apellido : email,
    grado:  st ? st.grado : '—',
    telPadre: st ? (st.telPadre||(padre&&padre.telefono)||'—') : '—',
    nombrePadre: padre ? padre.nombre+' '+padre.apellido : (st&&st.emailPadre||'—'),
    motivo:motivo,
    desc:   (document.getElementById('consulta-desc')       ||{}).value||'',
    temp:   (document.getElementById('consulta-temp')       ||{}).value||'',
    presion:(document.getElementById('consulta-presion')    ||{}).value||'',
    peso:   (document.getElementById('consulta-peso')       ||{}).value||'',
    tratamiento:(document.getElementById('consulta-tratamiento')||{}).value||'',
    estado:estado,
    hora:   (document.getElementById('consulta-hora')       ||{}).value||new Date().toTimeString().slice(0,5),
    notas:  (document.getElementById('consulta-notas')      ||{}).value||'',
    fecha:  new Date().toLocaleDateString('es-DO'),
    fechaISO: new Date().toISOString().split('T')[0],
    registradoPor: APP.currentUser ? APP.currentUser.name : 'Enfermería'
  };
  APP.consultas.push(consulta);
  persistSave();
  closeModal('modal-consulta');
  // Clear form
  ['consulta-desc','consulta-temp','consulta-presion','consulta-peso','consulta-tratamiento','consulta-notas'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('consulta-datos-est').style.display='none';
  // Notify padre
  if(st && st.emailPadre){
    addNotifToUser(st.emailPadre,'🏥 Su hijo/a '+consulta.nombre+' visitó enfermería — '+motivo+'. Estado: '+estado);
  }
  renderEnferInicio();
  if(document.getElementById('enfer-registros').style.display!=='none') renderRegistrosEnfer();
  toast('✅ Consulta registrada','success');
  logAudit('enfermeria','Consulta: '+consulta.nombre+' — '+motivo+' ('+estado+')');
}

// ── Render inicio panel ───────────────────────────────────────────
function renderEnferInicio(){
  var hoy = new Date().toLocaleDateString('es-DO');
  var consultasHoy = (APP.consultas||[]).filter(function(c){ return c.fecha===hoy; });
  var total = APP.consultas.length;
  var enviados = (APP.consultas||[]).filter(function(c){ return c.estado==='Enviado al hogar'; }).length;
  var referidos = (APP.consultas||[]).filter(function(c){ return c.estado==='Referido hospital'; }).length;

  kpiCards('enfer-kpis-dia',[
    {icon:'🕐',label:'Consultas hoy',     val:consultasHoy.length, color:'#0f4c75',bg:'#e0f2fe'},
    {icon:'📋',label:'Total histórico',   val:total,               color:'#7c3aed',bg:'#ede9fe'},
    {icon:'🏠',label:'Enviados al hogar', val:enviados,            color:'#d97706',bg:'#fef3c7'},
    {icon:'🏥',label:'Referidos hospital',val:referidos,           color:'#dc2626',bg:'#fee2e2'},
  ]);

  // Consultas de hoy
  var hoyEl = document.getElementById('enfer-hoy-list');
  if(hoyEl) hoyEl.innerHTML = consultasHoy.length
    ? consultasHoy.slice().reverse().slice(0,5).map(function(c){
        var estadoColor = {
          'En observación':'#d97706','Despachado':'#16a34a',
          'Llamaron al padre':'#2563eb','Enviado al hogar':'#7c3aed','Referido hospital':'#dc2626'
        }[c.estado]||'#888';
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;margin-bottom:6px;background:#f8fafc;border-left:3px solid '+estadoColor+';">'
          +'<div style="flex:1;"><div style="font-weight:600;font-size:13px;">'+c.nombre+'</div>'
          +'<div style="font-size:11px;color:#888;">'+c.motivo+' · '+c.hora+'</div></div>'
          +'<span style="font-size:11px;font-weight:700;color:'+estadoColor+';">'+c.estado+'</span>'
          +'</div>';
      }).join('')
    : '<p style="color:#888;font-size:13px;padding:10px;text-align:center;">Sin consultas hoy.</p>';

  // Frecuentes
  var freqMap = {};
  (APP.consultas||[]).forEach(function(c){ freqMap[c.email]=(freqMap[c.email]||0)+1; });
  var frecuentes = Object.keys(freqMap)
    .map(function(e){
      var s=(APP.students||[]).find(function(st){return st.email===e;});
      return {nombre:s?s.nombre+' '+s.apellido:e,grado:s?s.grado:'',count:freqMap[e],email:e};
    })
    .filter(function(s){return s.count>=2;})
    .sort(function(a,b){return b.count-a.count;})
    .slice(0,6);
  var freqEl = document.getElementById('enfer-frecuentes-list');
  if(freqEl) freqEl.innerHTML = frecuentes.length
    ? frecuentes.map(function(s){
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;margin-bottom:5px;background:white;border:1px solid var(--border);">'
          +'<div style="font-size:20px;font-weight:800;color:#ef4444;min-width:28px;text-align:center;">'+s.count+'</div>'
          +'<div><div style="font-weight:600;font-size:13px;">'+s.nombre+'</div><div style="font-size:11px;color:#888;">'+s.grado+'</div></div>'
          +'</div>';
      }).join('')
    : '<p style="color:#888;font-size:13px;padding:10px;">Sin estudiantes frecuentes aún.</p>';

  // Protocolos
  var protocolos = [
    {icon:'🤒',titulo:'Fiebre alta',          desc:'T° > 38.5°C: compresas frías, notificar padre, evaluar referido.'},
    {icon:'🤕',titulo:'Golpe en la cabeza',    desc:'Observar 30 min. Si hay nausea/mareo: referir de inmediato.'},
    {icon:'🩸',titulo:'Herida / Sangrado',     desc:'Limpiar con agua, aplicar antiséptico, cubrir con gasa estéril.'},
    {icon:'😮‍💨',titulo:'Dificultad respiratoria',desc:'Sentar al estudiante, calmar, notificar padre y referir si persiste.'},
    {icon:'😵',titulo:'Mareo / Desmayo',       desc:'Posición horizontal, elevar piernas. No dejar solo. Llamar al padre.'},
    {icon:'🤧',titulo:'Reacción alérgica',     desc:'Identificar alérgeno, antihistamínico si disponible, referir si hay edema.'},
  ];
  var protEl = document.getElementById('enfer-protocolos');
  if(protEl) protEl.innerHTML = protocolos.map(function(p){
    return '<div style="background:#f0f9ff;border-radius:10px;padding:14px;border-left:4px solid #0f4c75;">'
      +'<div style="font-size:22px;margin-bottom:4px;">'+p.icon+'</div>'
      +'<div style="font-weight:700;font-size:13px;color:#0f4c75;margin-bottom:4px;">'+p.titulo+'</div>'
      +'<div style="font-size:12px;color:#444;line-height:1.4;">'+p.desc+'</div>'
      +'</div>';
  }).join('');
}

// ── Render registros table ────────────────────────────────────────
function renderRegistrosEnfer(){
  populateConsultaEstSelect();
  var filtFecha  = (document.getElementById('enfer-filter-fecha') ||{}).value||'';
  var filtEstado = (document.getElementById('enfer-filter-estado')||{}).value||'';
  var filtSearch = ((document.getElementById('enfer-filter-search')||{}).value||'').toLowerCase();
  var datos = (APP.consultas||[]).filter(function(c){
    return (!filtFecha  || c.fechaISO===filtFecha)
        && (!filtEstado || c.estado===filtEstado)
        && (!filtSearch || c.nombre.toLowerCase().includes(filtSearch));
  }).slice().reverse();

  var wrap = document.getElementById('enfer-registros-table');
  if(!wrap) return;
  if(!datos.length){ wrap.innerHTML='<p style="color:#888;padding:20px;text-align:center;">Sin registros con esos filtros.</p>'; return; }

  var estadoColor = function(e){
    return {'En observación':'#d97706','Despachado':'#16a34a','Llamaron al padre':'#2563eb','Enviado al hogar':'#7c3aed','Referido hospital':'#dc2626'}[e]||'#888';
  };
  var estadoBg = function(e){
    return {'En observación':'#fef3c7','Despachado':'#dcfce7','Llamaron al padre':'#dbeafe','Enviado al hogar':'#ede9fe','Referido hospital':'#fee2e2'}[e]||'#f5f5f5';
  };

  wrap.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    +'<thead><tr style="background:var(--navy);color:white;">'
    +'<th style="padding:9px 12px;text-align:left;">Estudiante</th>'
    +'<th style="padding:9px 12px;">Grado</th>'
    +'<th style="padding:9px 12px;">Motivo</th>'
    +'<th style="padding:9px 12px;">Tratamiento</th>'
    +'<th style="padding:9px 12px;">Tel. Padre</th>'
    +'<th style="padding:9px 12px;">Estado</th>'
    +'<th style="padding:9px 12px;">Fecha / Hora</th>'
    +'<th style="padding:9px 12px;">Acc.</th>'
    +'</tr></thead><tbody>'
    + datos.map(function(c){
        var realIdx = APP.consultas.indexOf(c);
        return '<tr style="border-bottom:1px solid var(--border);">'
          +'<td style="padding:9px 12px;font-weight:600;">'+c.nombre+'</td>'
          +'<td style="padding:9px 12px;text-align:center;">'+c.grado+'</td>'
          +'<td style="padding:9px 12px;">'+c.motivo+'</td>'
          +'<td style="padding:9px 12px;color:#555;font-size:12px;">'+(c.tratamiento||'—')+'</td>'
          +'<td style="padding:9px 12px;text-align:center;">'
          +'<a href="tel:'+c.telPadre.replace(/\D/g,'')+'" style="color:#0f4c75;font-weight:600;text-decoration:none;">'+c.telPadre+'</a>'
          +'</td>'
          +'<td style="padding:9px 12px;text-align:center;">'
          +'<span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:'+estadoBg(c.estado)+';color:'+estadoColor(c.estado)+';">'+c.estado+'</span>'
          +'</td>'
          +'<td style="padding:9px 12px;text-align:center;font-size:12px;">'+c.fecha+'<br><span style="color:#888;">'+c.hora+'</span></td>'
          +'<td style="padding:9px 12px;text-align:center;">'
          +'<button onclick="verConsulta('+realIdx+')" style="background:none;border:none;cursor:pointer;font-size:15px;" title="Ver detalle">👁️</button> '
          +'<button onclick="deleteConsulta('+realIdx+')" style="background:none;border:none;cursor:pointer;font-size:15px;color:#ef4444;" title="Eliminar">🗑️</button>'
          +'</td></tr>';
      }).join('')
    +'</tbody></table>';
}

function deleteConsulta(idx){
  if(!confirm('¿Eliminar este registro?')) return;
  APP.consultas.splice(idx,1);
  persistSave();
  renderRegistrosEnfer();
  renderEnferInicio();
  toast('Registro eliminado','info');
}

function verConsulta(idx){
  var c = APP.consultas[idx];
  if(!c) return;
  var signos = [];
  if(c.temp)    signos.push('Temp: '+c.temp+'°C');
  if(c.presion) signos.push('P.A.: '+c.presion);
  if(c.peso)    signos.push('Peso: '+c.peso+'kg');
  alert('CONSULTA #'+c.id+'\n\nEstudiante: '+c.nombre+' ('+c.grado+')\n'
    +'Padre/Tutor: '+c.nombrePadre+'\nTel: '+c.telPadre+'\n\n'
    +'Motivo: '+c.motivo+'\n'+(c.desc?'Descripción: '+c.desc+'\n':'')
    +(signos.length?'Signos vitales: '+signos.join(' | ')+'\n':'')
    +(c.tratamiento?'Tratamiento: '+c.tratamiento+'\n':'')
    +'Estado: '+c.estado+'\n'
    +(c.notas?'Notas: '+c.notas+'\n':'')
    +'\nFecha: '+c.fecha+' — '+c.hora
    +'\nRegistrado por: '+c.registradoPor);
}

function exportEnferCSV(){
  var rows=[['ID','Estudiante','Grado','Motivo','Tratamiento','Estado','Tel Padre','Fecha','Hora']];
  (APP.consultas||[]).forEach(function(c){
    rows.push([c.id,c.nombre,c.grado,c.motivo,c.tratamiento||'',c.estado,c.telPadre,c.fecha,c.hora]);
  });
  var csv=rows.map(function(r){return r.join(',');}).join('\n');
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='enfermeria_'+new Date().toISOString().split('T')[0]+'.csv';
  a.click();
}

// ── Buscar estudiante ────────────────────────────────────────────
function renderBuscarEstEnfer(){
  buscarEstEnfer();
}
function buscarEstEnfer(){
  var q = ((document.getElementById('enfer-buscar-input')||{}).value||'').toLowerCase();
  var res = document.getElementById('enfer-buscar-results');
  if(!res) return;
  var lista = (APP.students||[]).filter(function(s){
    return !q || (s.nombre+' '+s.apellido+' '+s.id).toLowerCase().includes(q);
  }).slice(0,15);
  if(!lista.length){ res.innerHTML='<p style="color:#888;padding:12px;">No se encontraron estudiantes.</p>'; return; }
  res.innerHTML = lista.map(function(s){
    var visitas = (APP.consultas||[]).filter(function(c){return c.email===s.email;}).length;
    var padre = (APP.padres||[]).find(function(p){return p.email===s.emailPadre;});
    var tel = s.telPadre || (padre&&padre.telefono) || '—';
    var ultConsulta = (APP.consultas||[]).filter(function(c){return c.email===s.email;}).pop();
    return '<div style="background:white;border-radius:12px;padding:14px 16px;margin-bottom:10px;border:1px solid var(--border);box-shadow:0 2px 8px rgba(0,0,0,.05);">'
      +'<div style="display:flex;align-items:flex-start;gap:12px;">'
      +'<div style="font-size:32px;background:#e0f2fe;border-radius:10px;padding:8px;line-height:1;">🎓</div>'
      +'<div style="flex:1;">'
      +'<div style="font-weight:700;font-size:15px;color:var(--navy);">'+s.nombre+' '+s.apellido+'</div>'
      +'<div style="font-size:12px;color:#666;margin-top:2px;">📚 '+s.grado+(s.carrera?' · '+s.carrera:'')+'</div>'
      +'<div style="font-size:12px;color:#666;">ID: '+s.id+'</div>'
      +'</div>'
      +'<div style="text-align:right;">'
      +'<div style="font-size:20px;font-weight:800;color:'+(visitas>=3?'#ef4444':visitas>=1?'#d97706':'#888')+';">'+visitas+'</div>'
      +'<div style="font-size:10px;color:#888;">visita(s)</div>'
      +'</div>'
      +'</div>'
      +'<div style="margin-top:10px;padding-top:10px;border-top:1px solid #f0f0f0;display:flex;gap:12px;flex-wrap:wrap;font-size:12px;">'
      +'<span>👪 '+s.emailPadre+'</span>'
      +'<a href="tel:'+tel.replace(/\D/g,'')+'" style="color:#0f4c75;font-weight:600;">📞 '+tel+'</a>'
      +(ultConsulta?'<span style="color:#888;">Última visita: '+ultConsulta.fecha+' — '+ultConsulta.motivo+'</span>':'')
      +'</div>'
      +'<div style="margin-top:10px;"><button onclick="precargarConsulta(\''+s.email+'\')" class="btn" style="background:#0f4c75;color:white;font-size:12px;padding:5px 14px;">➕ Registrar consulta</button></div>'
      +'</div>';
  }).join('');
}

function precargarConsulta(email){
  openModal('modal-consulta');
  setTimeout(function(){
    var sel = document.getElementById('consulta-estudiante');
    if(sel){ sel.value=email; loadDatosEstEnfer(); }
  },100);
}

// ── Estadísticas ─────────────────────────────────────────────────
function renderEnferStats(){
  var consultas = APP.consultas||[];
  var hoy = new Date().toLocaleDateString('es-DO');
  kpiCards('enfer-stats-kpis',[
    {icon:'📋',label:'Total consultas',      val:consultas.length,                                            color:'#0f4c75',bg:'#e0f2fe'},
    {icon:'🕐',label:'Hoy',                  val:consultas.filter(function(c){return c.fecha===hoy;}).length, color:'#7c3aed',bg:'#ede9fe'},
    {icon:'🏠',label:'Enviados hogar',       val:consultas.filter(function(c){return c.estado==='Enviado al hogar';}).length, color:'#d97706',bg:'#fef3c7'},
    {icon:'🏥',label:'Referidos',            val:consultas.filter(function(c){return c.estado==='Referido hospital';}).length,color:'#dc2626',bg:'#fee2e2'},
  ]);
  // Motivos frecuentes
  var motivoMap={};
  consultas.forEach(function(c){motivoMap[c.motivo]=(motivoMap[c.motivo]||0)+1;});
  var motivos=Object.keys(motivoMap).sort(function(a,b){return motivoMap[b]-motivoMap[a];}).slice(0,8);
  var maxM=Math.max(1,...Object.values(motivoMap));
  var mEl=document.getElementById('enfer-stats-motivos');
  if(mEl) mEl.innerHTML=motivos.length?motivos.map(function(m){
    var w=Math.min(100,(motivoMap[m]/maxM*100));
    return '<div style="margin-bottom:8px;">'
      +'<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">'
      +'<span>'+m+'</span><span style="font-weight:700;color:#0f4c75;">'+motivoMap[m]+'</span></div>'
      +'<div style="height:8px;background:#f0f0f0;border-radius:4px;"><div style="height:100%;width:'+w+'%;background:#1b6ca8;border-radius:4px;"></div></div>'
      +'</div>';
  }).join(''):'<p style="color:#888;font-size:13px;">Sin datos.</p>';
  // Por mes
  var mesesOrder=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var mesMap=Array(12).fill(0);
  consultas.forEach(function(c){
    var d=new Date(c.fechaISO+'T12:00'); if(!isNaN(d)) mesMap[d.getMonth()]++;
  });
  var maxMes=Math.max(1,...mesMap);
  var mesEl=document.getElementById('enfer-stats-mes');
  if(mesEl) mesEl.innerHTML='<div style="display:flex;gap:4px;align-items:flex-end;height:100%;width:100%;">'
    +mesMap.map(function(v,i){
      var h=Math.max(4,Math.round((v/maxMes)*100));
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">'
        +'<span style="font-size:9px;font-weight:700;color:#0f4c75;">'+v+'</span>'
        +'<div style="width:100%;background:#1b6ca8;border-radius:3px 3px 0 0;height:'+h+'px;"></div>'
        +'<span style="font-size:8px;color:#888;">'+(mesesOrder[i]||'').slice(0,3)+'</span>'
        +'</div>';
    }).join('')+'</div>';
  // Top estudiantes
  var estMap={};
  consultas.forEach(function(c){estMap[c.email]=(estMap[c.email]||0)+1;});
  var topEst=Object.keys(estMap).map(function(e){
    var s=(APP.students||[]).find(function(st){return st.email===e;});
    return {nombre:s?s.nombre+' '+s.apellido:e,grado:s?s.grado:'',count:estMap[e]};
  }).sort(function(a,b){return b.count-a.count;}).slice(0,8);
  var topEl=document.getElementById('enfer-stats-top');
  if(topEl) topEl.innerHTML=topEst.length?topEst.map(function(s,i){
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;margin-bottom:5px;background:white;border:1px solid var(--border);">'
      +'<span style="font-size:18px;font-weight:800;color:#0f4c75;min-width:24px;">'+(i+1)+'</span>'
      +'<div style="flex:1;"><div style="font-weight:600;font-size:13px;">'+s.nombre+'</div><div style="font-size:11px;color:#888;">'+s.grado+'</div></div>'
      +'<span style="font-weight:700;color:#0f4c75;">'+s.count+' visita(s)</span>'
      +'</div>';
  }).join(''):'<p style="color:#888;font-size:13px;">Sin datos.</p>';
}

// ── Stock ────────────────────────────────────────────────────────
function saveStock(){
  var nombre   = (document.getElementById('stock-nombre')  ||{}).value||'';
  var cantidad = parseInt((document.getElementById('stock-cantidad')||{}).value)||0;
  if(!nombre){ toast('El nombre es obligatorio','error'); return; }
  var item = {
    id:'S-'+Date.now(),
    nombre:nombre,
    cat:   (document.getElementById('stock-cat')     ||{}).value||'Otro',
    cantidad:cantidad,
    unidad:(document.getElementById('stock-unidad')  ||{}).value||'unidades',
    vence: (document.getElementById('stock-vence')   ||{}).value||'',
    minimo:parseInt((document.getElementById('stock-minimo')||{}).value)||5,
  };
  APP.stockEnfer.push(item);
  persistSave();
  closeModal('modal-stock');
  ['stock-nombre','stock-cantidad','stock-unidad','stock-vence','stock-minimo'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  renderStock();
  toast('✅ Agregado al inventario','success');
}

function renderStock(){
  var el = document.getElementById('enfer-stock-table');
  if(!el) return;
  var stock = APP.stockEnfer||[];
  if(!stock.length){ el.innerHTML='<p style="color:#888;padding:20px;text-align:center;">Inventario vacío.</p>'; return; }
  var hoy = new Date();
  el.innerHTML='<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    +'<thead><tr style="background:var(--navy);color:white;">'
    +'<th style="padding:9px 12px;text-align:left;">Medicamento / Suministro</th>'
    +'<th style="padding:9px 12px;">Categoría</th>'
    +'<th style="padding:9px 12px;">Cantidad</th>'
    +'<th style="padding:9px 12px;">Vencimiento</th>'
    +'<th style="padding:9px 12px;">Estado</th>'
    +'<th style="padding:9px 12px;">Acciones</th>'
    +'</tr></thead><tbody>'
    +stock.map(function(s,i){
      var bajo   = s.cantidad <= s.minimo;
      var venceProx = s.vence && (new Date(s.vence)-hoy)/(1000*60*60*24) < 60;
      var vencido   = s.vence && new Date(s.vence) < hoy;
      var estado, estadoStyle;
      if(vencido)        { estado='⛔ Vencido';      estadoStyle='background:#fee2e2;color:#dc2626;'; }
      else if(venceProx) { estado='⚠️ Próx. vencer'; estadoStyle='background:#fef3c7;color:#d97706;'; }
      else if(bajo)      { estado='🔴 Stock bajo';   estadoStyle='background:#fee2e2;color:#dc2626;'; }
      else               { estado='✅ OK';            estadoStyle='background:#dcfce7;color:#16a34a;'; }
      return '<tr style="border-bottom:1px solid var(--border);">'
        +'<td style="padding:9px 12px;font-weight:600;">'+s.nombre+'</td>'
        +'<td style="padding:9px 12px;text-align:center;">'+s.cat+'</td>'
        +'<td style="padding:9px 12px;text-align:center;font-weight:700;color:'+(bajo?'#dc2626':'#16a34a')+';">'+s.cantidad+' '+s.unidad+'</td>'
        +'<td style="padding:9px 12px;text-align:center;font-size:12px;">'+(s.vence||'—')+'</td>'
        +'<td style="padding:9px 12px;text-align:center;"><span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;'+estadoStyle+'">'+estado+'</span></td>'
        +'<td style="padding:9px 12px;text-align:center;">'
        +'<button onclick="ajustarStock('+i+',1)"  style="background:#16a34a;border:none;color:white;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:13px;margin:0 2px;">+</button>'
        +'<button onclick="ajustarStock('+i+',-1)" style="background:#ef4444;border:none;color:white;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:13px;margin:0 2px;">−</button>'
        +'<button onclick="deleteStock('+i+')"     style="background:none;border:none;cursor:pointer;font-size:14px;margin-left:4px;" title="Eliminar">🗑️</button>'
        +'</td></tr>';
    }).join('')+'</tbody></table>';
}
function ajustarStock(i,delta){
  if(!APP.stockEnfer[i]) return;
  APP.stockEnfer[i].cantidad = Math.max(0, APP.stockEnfer[i].cantidad + delta);
  persistSave(); renderStock();
}
function deleteStock(i){
  if(!confirm('¿Eliminar este item?')) return;
  APP.stockEnfer.splice(i,1); persistSave(); renderStock();
}

// ── Admin panel view for enfermería ─────────────────────────────
// Add to renderAdminData hook
var _origRenderAdminData = typeof renderAdminData==='function' ? renderAdminData : function(){};
renderAdminData = function(){
  _origRenderAdminData();
  renderEnferAdmin();
};
function renderEnferAdmin(){
  var el = document.getElementById('admin-enfer-list');
  if(!el) return;
  var consultas = (APP.consultas||[]).slice().reverse().slice(0,20);
  if(!consultas.length){ el.innerHTML='<p style="color:#888;padding:16px;text-align:center;">Sin registros de enfermería.</p>'; return; }
  var ec = {'En observación':'#d97706','Despachado':'#16a34a','Llamaron al padre':'#2563eb','Enviado al hogar':'#7c3aed','Referido hospital':'#dc2626'};
  var eb = {'En observación':'#fef3c7','Despachado':'#dcfce7','Llamaron al padre':'#dbeafe','Enviado al hogar':'#ede9fe','Referido hospital':'#fee2e2'};
  el.innerHTML='<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    +'<thead><tr style="background:var(--navy);color:white;">'
    +'<th style="padding:8px 12px;text-align:left;">Estudiante</th><th style="padding:8px 12px;">Grado</th>'
    +'<th style="padding:8px 12px;">Motivo</th><th style="padding:8px 12px;">Estado</th>'
    +'<th style="padding:8px 12px;">Fecha</th></tr></thead><tbody>'
    +consultas.map(function(c){
      return '<tr style="border-bottom:1px solid var(--border);">'
        +'<td style="padding:8px 12px;font-weight:600;">'+c.nombre+'</td>'
        +'<td style="padding:8px 12px;text-align:center;">'+c.grado+'</td>'
        +'<td style="padding:8px 12px;">'+c.motivo+'</td>'
        +'<td style="padding:8px 12px;text-align:center;"><span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:'+(eb[c.estado]||'#f5f5f5')+';color:'+(ec[c.estado]||'#888')+';">'+c.estado+'</span></td>'
        +'<td style="padding:8px 12px;text-align:center;font-size:12px;">'+c.fecha+' '+c.hora+'</td>'
        +'</tr>';
    }).join('')+'</tbody></table>';
}

// ── BOT ENFERMERÍA KB ────────────────────────────────────────────
var KB_ENFER = {
  fiebre:    {k:['fiebre','temperatura','calentura','38','39'],
    r:'🌡️ **Protocolo fiebre:** T° 37.5-38°C → compresas frías, hidratación. T° >38.5°C → paracetamol (si autorizado), notificar al padre de inmediato. T° >39°C → referir al hospital. Registra la temperatura cada 30 minutos.'},
  herida:    {k:['herida','cortada','sangrado','corte','raspón'],
    r:'🩹 **Protocolo heridas:** 1) Detener el sangrado con presión directa. 2) Limpiar con agua y jabón. 3) Aplicar antiséptico (alcohol o agua oxigenada). 4) Cubrir con gasa estéril y esparadrapo. Si la herida es profunda o no para de sangrar → referir urgente.'},
  golpe:     {k:['golpe','caída','contusion','trauma','cabeza'],
    r:'🤕 **Protocolo golpe en la cabeza:** Observar por 30 minutos. Señales de alarma: pérdida de conciencia, confusión, vómito, pupilas desiguales, dolor intenso → referir al hospital de inmediato. Notificar al padre siempre.'},
  desmayo:   {k:['desmayo','mareo','desmayó','pérdida de conciencia','síncope'],
    r:'😵 **Protocolo desmayo:** 1) Acostar al estudiante, elevar las piernas. 2) Aflojar ropa ajustada. 3) Verificar pulso y respiración. 4) NO dar nada por la boca si está inconsciente. 5) Llamar al padre y al 911 si no recupera en 2 minutos.'},
  alergica:  {k:['alergia','alérgico','reacción','urticaria','picada'],
    r:'🤧 **Reacción alérgica:** Identificar el alérgeno y retirarlo. Loratadina si está disponible y el estudiante no es alérgico a antihistamínicos. Si hay dificultad para respirar, hinchazón en la garganta o cara → emergencia, llamar al 911 de inmediato.'},
  respirar:  {k:['respiración','asma','dificultad respirar','bronquio','ahogo'],
    r:'😮‍💨 **Dificultad respiratoria:** Sentar al estudiante, calmar. Si tiene inhalador → usarlo. Aflojar ropa del cuello. Si no mejora en 5 minutos → llamar al 911 y notificar al padre urgente. No dejar solo nunca.'},
  estomago:  {k:['estómago','náuseas','vómito','dolor abdominal','diarrea'],
    r:'🤢 **Malestar gastrointestinal:** Posición cómoda, hidratación oral pequeños sorbos. Si hay vómito repetitivo, sangre en heces o dolor agudo → referir. Revisar si comió algo inusual. Notificar al padre.'},
  tension:   {k:['presión','tensión','hipertensión','hipotensión','mareo'],
    r:'💓 **Presión arterial:** Normal en adolescentes: 110-120/70-80 mmHg. Alta (>140/90): reposo, llamar al padre. Baja (<90/60): acostar, hidratar, elevar piernas. Si hay síntomas severos → referir urgente.'},
  signos:    {k:['signos vitales','temperatura normal','pulso','frecuencia'],
    r:'📊 **Valores normales en adolescentes:**\n• Temperatura: 36-37.5°C\n• Pulso: 60-100 latidos/min\n• Respiración: 12-20/min\n• Presión arterial: 100-120/60-80 mmHg\n• Saturación O₂: >95%'},
  medicamentos:{k:['paracetamol','ibuprofeno','medicamento','dosis','pastilla'],
    r:'💊 **Medicamentos comunes:** Paracetamol 500mg: dolor/fiebre, cada 6-8h. Ibuprofeno 400mg: inflamación/dolor, cada 8h (con comida). NUNCA administrar sin conocer alergias del estudiante. Registrar siempre el medicamento dado en el sistema.'},
  emergencia:{k:['emergencia','urgencia','911','ambulancia','grave'],
    r:'🚨 **Emergencias:** Llama al **911** (ambulancia) o al **809-590-0771** (centro). Dirección: Av. Charles de Gaulle, Sabana Perdida, SDN. Mantén calma, no muevas al estudiante si hay trauma en columna. Documenta todo lo ocurrido.'},
  registro:  {k:['registrar','anotar','historial','expediente','consulta'],
    r:'📋 **Registro de consultas:** Usa el botón **➕ Nueva Consulta** en tu panel. Llena: nombre del estudiante, motivo, signos vitales, tratamiento dado y estado final. El sistema notifica automáticamente al padre al guardar.'},
  contacto:  {k:['padre','llamar','contactar','tutor','teléfono'],
    r:'📞 **Contactar al padre:** El número aparece automáticamente al seleccionar al estudiante en la consulta. También en la tabla de registros → clic en el número para llamar directamente desde el celular.'},
};

// Add enfer to FAB_CFG and patterns
FAB_CFG['enfer'] = {
  emoji:'🏥',
  nombre:'Asistente de Enfermería',
  kb:KB_ENFER,
  qr:['🌡️ Protocolo fiebre','🩹 Herida / Sangrado','😵 Desmayo / Mareo','💊 Medicamentos','🚨 Emergencia','📋 Registrar consulta']
};
fabOpen['enfer']   = false;
fabHistory['enfer'] = [];

// Add enfer prefix
if(typeof FAB_PFX !== 'undefined') FAB_PFX['enfer'] = 'bfe';
else { try{ FAB_PFX['enfer']='bfe'; }catch(e){} }

// Logout patch for enfermeria


// ── Enhanced renderEnferAdmin with KPIs and stock alerts ─────────
var _reaOrig = renderEnferAdmin;
renderEnferAdmin = function(){
  // KPIs
  var kpiEl = document.getElementById('enfer-admin-kpis');
  if(kpiEl){
    var hoy = new Date().toLocaleDateString('es-DO');
    var hoyC = (APP.consultas||[]).filter(function(c){return c.fecha===hoy;}).length;
    var refC = (APP.consultas||[]).filter(function(c){return c.estado==='Referido hospital';}).length;
    var bajosStock = (APP.stockEnfer||[]).filter(function(s){return s.cantidad<=s.minimo;}).length;
    kpiEl.innerHTML = [
      {icon:'🕐',val:hoyC,label:'Hoy',c:'#0f4c75',bg:'#e0f2fe'},
      {icon:'🏥',val:refC,label:'Referidos',c:'#dc2626',bg:'#fee2e2'},
      {icon:'💊',val:bajosStock,label:'Stock bajo',c:'#d97706',bg:'#fef3c7'},
    ].map(function(k){
      return '<div style="background:'+k.bg+';border-radius:10px;padding:8px 14px;text-align:center;">'
        +'<div style="font-size:18px;">'+k.icon+'</div>'
        +'<div style="font-size:18px;font-weight:800;color:'+k.c+';">'+k.val+'</div>'
        +'<div style="font-size:11px;color:#666;">'+k.label+'</div>'
        +'</div>';
    }).join('');
  }
  // Stock alerts
  var saEl = document.getElementById('enfer-admin-stock-alerts');
  if(saEl){
    var alertas = (APP.stockEnfer||[]).filter(function(s){return s.cantidad<=s.minimo;});
    saEl.innerHTML = alertas.length
      ? '<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;padding:12px 16px;font-size:13px;">'
        +'<b>⚠️ Alerta de stock bajo:</b> '
        +alertas.map(function(s){return s.nombre+' ('+s.cantidad+' '+s.unidad+')';}).join(' · ')
        +'</div>'
      : '';
  }
  _reaOrig();
};

// Also patch FAB_PFX safely after it's defined
setTimeout(function(){
  if(typeof FAB_PFX !== 'undefined') FAB_PFX['enfer'] = 'bfe';
}, 500);

// ================================================================
//  🌐 MEJORAS GLOBALES — Pagos público, Reglamento, Social, etc.
// ================================================================

// ── Render pagos public page ──────────────────────────────────────
function renderPagosPublic(){
  var grid = document.getElementById('pagos-public-grid');
  if(!grid) return;
  var emptyMsg = document.getElementById('pagos-public-empty');
  var productos = APP.productos || [];
  if(!productos.length){
    grid.innerHTML = '';
    if(emptyMsg) emptyMsg.style.display = 'block';
    return;
  }
  if(emptyMsg) emptyMsg.style.display = 'none';
  // Group by category
  var cats = {};
  productos.forEach(function(p){
    var c = p.categoria || 'Otros';
    if(!cats[c]) cats[c]=[];
    cats[c].push(p);
  });
  var catIcons = {
    'Uniforme Diario':'👔','Uniforme Deportivo':'🏃','Técnico Medicina':'🏥',
    'Técnico Multimedia':'🎬','Técnico Gráfica':'🎨','Matrícula':'📋',
    'Mensualidad':'💳','Retiro':'🚪','Papelería':'📒','Libros':'📚','Otros':'📦'
  };
  var catColors = {
    'Uniforme Diario':'#e0f2fe','Uniforme Deportivo':'#dcfce7','Técnico Medicina':'#fce7f3',
    'Técnico Multimedia':'#ede9fe','Técnico Gráfica':'#fef3c7','Matrícula':'#fee2e2',
    'Mensualidad':'#dbeafe','Retiro':'#f3f4f6','Papelería':'#fef9c3','Libros':'#e0f2fe'
  };
  grid.innerHTML = Object.keys(cats).map(function(cat){
    var bg = catColors[cat] || '#f8fafc';
    var icon = catIcons[cat] || '📦';
    var items = cats[cat];
    return '<div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">'
      +'<div style="background:'+bg+';padding:18px 20px;display:flex;align-items:center;gap:12px;border-bottom:2px solid rgba(0,0,0,.06);">'
      +'<span style="font-size:28px;">'+icon+'</span>'
      +'<h3 style="margin:0;font-size:15px;color:#1a2a50;font-weight:800;">'+cat+'</h3>'
      +'</div>'
      +'<div style="padding:16px;">'
      + items.map(function(p){
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #f0f0f0;">'
            +'<span style="font-size:13px;color:#333;">'+p.nombre+'</span>'
            +'<span style="font-weight:800;color:#0f4c75;font-size:14px;">RD$ '+Number(p.precio||0).toLocaleString()+'</span>'
            +'</div>';
        }).join('')
      +'</div></div>';
  }).join('');
}

// ── Render reglamento public ──────────────────────────────────────
function renderReglamentoPublic(){
  var el = document.getElementById('reg-pub-sections');
  if(!el) return;
  var reg = APP.reglamento;
  if(reg && reg.content){
    // Use configured reglamento
    document.getElementById('reglamento-public-content').innerHTML =
      '<div style="background:white;border-radius:16px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.06);white-space:pre-wrap;font-size:14px;line-height:1.7;color:#333;">'+reg.content+'</div>';
    return;
  }
  // Default reglamento
  var secciones = [
    {titulo:'🎒 Asistencia y Puntualidad', color:'#e0f2fe', items:[
      'La entrada es a las 7:30 AM. Después de las 8:00 AM se considera tardanza.',
      'Tres tardanzas equivalen a una ausencia injustificada.',
      'Las ausencias deben ser justificadas dentro de los 3 días hábiles siguientes.',
      'Para retiro anticipado se requiere autorización escrita del padre/tutor.',
    ]},
    {titulo:'👔 Uniforme y Presentación', color:'#dcfce7', items:[
      'Uniforme diario: Pantalón azul marino, camisa/poloche blanco con logo.',
      'Uniforme deportivo: Pantalón gris, franela gris con logo.',
      'El uniforme debe usarse limpio, completo y en buen estado todos los días.',
      'No se permiten piercings visibles, tintes llamativos ni accesorios excesivos.',
    ]},
    {titulo:'📱 Tecnología y Dispositivos', color:'#fce7f3', items:[
      'El uso del celular en horas de clase está estrictamente prohibido.',
      'Los dispositivos electrónicos deben permanecer apagados y guardados.',
      'El centro no se responsabiliza por pérdida o daño de dispositivos personales.',
      'Las computadoras del centro deben usarse exclusivamente para fines educativos.',
    ]},
    {titulo:'🤝 Conducta y Convivencia', color:'#fef3c7', items:[
      'Se exige respeto mutuo entre estudiantes, maestros y personal administrativo.',
      'Se prohíbe el bullying, acoso escolar o cualquier forma de violencia física o verbal.',
      'Los daños causados a la propiedad del centro serán reparados por el responsable.',
      'El lenguaje soez o irrespetuoso es motivo de llamado de atención inmediato.',
    ]},
    {titulo:'📋 Evaluación y Académico', color:'#ede9fe', items:[
      'La nota mínima aprobatoria es 65 puntos según normativa MINERD.',
      'Los exámenes no presentados sin justificación válida tendrán nota de cero (0).',
      'Las tareas son obligatorias y forman parte de la evaluación continua.',
      'El fraude académico (copiar) anula el examen y puede implicar suspensión.',
    ]},
    {titulo:'🚪 Normas Generales', color:'#fee2e2', items:[
      'Está prohibido traer artículos ajenos al proceso educativo (juguetes, cartas, etc.).',
      'No se permite la venta de artículos dentro del centro sin autorización.',
      'Los estudiantes deben mantener limpias las aulas, pasillos y áreas comunes.',
      'Las actividades extracurriculares requieren autorización del padre/tutor.',
    ]},
  ];
  el.innerHTML = secciones.map(function(s){
    return '<div style="background:'+s.color+';border-radius:12px;padding:20px 24px;">'
      +'<h3 style="margin:0 0 12px;color:#1a2a50;font-size:16px;">'+s.titulo+'</h3>'
      +'<ul style="margin:0;padding-left:20px;display:grid;gap:6px;">'
      + s.items.map(function(i){ return '<li style="font-size:13px;color:#333;line-height:1.5;">'+i+'</li>'; }).join('')
      +'</ul></div>';
  }).join('');
}

// ── Social feed cards ─────────────────────────────────────────────
function renderSocialFeed(){
  var grid = document.getElementById('fb-posts-grid');
  if(!grid) return;
  // Use admin announcements as social feed cards if available
  var posts = (APP.announcements||[]).slice(0,6);
  if(!posts.length){
    // Default placeholder posts
    posts = [
      {title:'📢 Inicio del Año Escolar 2025-2026', content:'Damos la bienvenida a todos nuestros estudiantes. Este año lleno de aprendizaje y crecimiento.', date:'Ago 2025', tipo:'evento'},
      {title:'🏆 Premios al Mérito Estudiantil', content:'Felicitamos a nuestros estudiantes destacados del primer trimestre. ¡Orgullo de Otilia Peláez!', date:'Nov 2025', tipo:'info'},
      {title:'📝 Inscripciones Abiertas', content:'Las inscripciones para el año escolar 2025-2026 están abiertas. Contáctenos para más información.', date:'Jul 2025', tipo:'aviso'},
      {title:'🎭 Acto Cultural del Centro', content:'Gran acto cultural con la participación de todos los niveles. Música, danza y teatro.', date:'Oct 2025', tipo:'evento'},
      {title:'👩‍🏫 Día del Maestro', content:'Celebramos y honramos a nuestros maestros por su dedicación y amor a la educación.', date:'Jun 2025', tipo:'info'},
      {title:'⚽ Torneo Deportivo Interescolar', content:'Nuestros estudiantes participaron en el torneo distrital obteniendo excelentes resultados.', date:'Sep 2025', tipo:'evento'},
    ];
  }
  var tipoColor = {evento:'#2563eb',info:'#16a34a',aviso:'#d97706',urgente:'#dc2626'};
  var tipoBg    = {evento:'#dbeafe',info:'#dcfce7',aviso:'#fef3c7',urgente:'#fee2e2'};
  grid.innerHTML = posts.map(function(p){
    var color = tipoColor[p.tipo]||'#2563eb';
    var bg    = tipoBg[p.tipo]||'#dbeafe';
    var date  = p.date || p.fecha || '';
    return '<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:16px;overflow:hidden;transition:transform .2s;" onmouseover="this.style.transform=\'translateY(-4px)\'" onmouseout="this.style.transform=\'none\'">'
      +'<div style="background:'+color+';height:4px;"></div>'
      +'<div style="padding:20px;">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">'
      +'<span style="background:'+bg+';color:'+color+';padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">C.E. Otilia Peláez</span>'
      +(date?'<span style="color:rgba(255,255,255,0.4);font-size:11px;">'+date+'</span>':'')
      +'</div>'
      +'<h4 style="color:white;font-size:14px;font-weight:700;margin:0 0 8px;line-height:1.4;">'+p.title+'</h4>'
      +'<p style="color:rgba(255,255,255,0.6);font-size:12px;line-height:1.5;margin:0;">'+((p.content||p.description||'').substring(0,120))+(((p.content||'').length>120)?'…':'')+'</p>'
      +'</div>'
      +'<div style="padding:12px 20px;border-top:1px solid rgba(255,255,255,0.07);display:flex;gap:16px;">'
      +'<span style="color:rgba(255,255,255,0.4);font-size:12px;">👍 Me gusta</span>'
      +'<span style="color:rgba(255,255,255,0.4);font-size:12px;">💬 Comentar</span>'
      +'<span style="color:rgba(255,255,255,0.4);font-size:12px;">↗️ Compartir</span>'
      +'</div>'
      +'</div>';
  }).join('');
}



// Also init on page load
document.addEventListener('DOMContentLoaded', function(){
  setTimeout(renderSocialFeed, 300);
});

// ── 🔒 SISTEMA DE SEGURIDAD ──────────────────────────────────────
// Session timeout — 2 hours of inactivity
var _lastActivity = Date.now();
var _sessionTimeout = 2 * 60 * 60 * 1000; // 2 hours
document.addEventListener('mousemove', function(){ _lastActivity = Date.now(); });
document.addEventListener('keypress',  function(){ _lastActivity = Date.now(); });
document.addEventListener('click',     function(){ _lastActivity = Date.now(); });
setInterval(function(){
  if(APP.currentUser && Date.now() - _lastActivity > _sessionTimeout){
    toast('⏰ Sesión expirada por inactividad. Por favor inicie sesión nuevamente.','info');
    setTimeout(function(){ if(typeof logout==='function') logout(); }, 2000);
  }
}, 60000); // Check every minute

// ── 🩺 Nombre completo en enfermería ─────────────────────────────
// Allow enfermeria to set their display name
if(!APP.enferNombre) APP.enferNombre = 'Enfermería';
function saveEnferNombre(){
  var inp = document.getElementById('enfer-nombre-input');
  if(!inp || !inp.value.trim()) return;
  APP.enferNombre = inp.value.trim();
  persistSave();
  var displays = ['enfer-nombre-display','enfer-perfil-nombre'];
  displays.forEach(function(id){ var el=document.getElementById(id); if(el) el.textContent=APP.enferNombre; });
  if(APP.currentUser) APP.currentUser.name = APP.enferNombre;
  toast('✅ Nombre actualizado','success');
}


// ── Galería Pública ──────────────────────────────────────────────
function renderGaleriaPublic(){
  var grid  = document.getElementById('galeria-public-grid');
  var empty = document.getElementById('galeria-public-empty');
  if(!grid) return;
  var items = (APP.galeria||[]).filter(function(g){ return g.visible!==false; });
  if(!items.length){
    grid.innerHTML=''; if(empty) empty.style.display='block'; return;
  }
  if(empty) empty.style.display='none';
  grid.innerHTML = items.map(function(g){
    return '<div style="border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.1);background:white;">'
    card.style.cssText = 'border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.1);background:white;transition:transform .2s;cursor:pointer;';
    card.onmouseover = function(){ this.style.transform='scale(1.03)'; };
    card.onmouseout  = function(){ this.style.transform='scale(1)'; };
    var imgHtml = g.img
      ? '<img src="'+g.img+'" style="width:100%;height:100%;object-fit:cover;" loading="lazy">'
      : '<div style="height:100%;display:flex;align-items:center;justify-content:center;font-size:40px;">🖼️</div>';
    card.innerHTML = '<div style="height:180px;background:#eee;overflow:hidden;">'+imgHtml+'</div>'
      +'<div style="padding:12px;">'
      +'<div style="font-weight:700;font-size:13px;color:var(--navy);margin-bottom:4px;">'+(g.titulo||'')+'</div>'
      +(g.desc ? '<div style="font-size:12px;color:#666;">'+g.desc+'</div>' : '')
      +'</div>';
    return card.outerHTML;
  }).join('');
}

// ── Sistema de seguridad básico ────────────────────────────────────


// ── Sesión con timeout (30 min de inactividad) ────────────────────


// ================================================================
//  🌐 PUBLIC EVENTOS — muestra próximos eventos en la página pública
// ================================================================
function renderPublicEventos(){
  var el = document.getElementById('public-eventos-list');
  if(!el) return;
  var hoy = new Date();
  var CAL_COLORS = {Examen:'#ef4444',Evento:'#3b82f6',Feriado:'#22c55e',Reunión:'#f59e0b',Actividad:'#8b5cf6'};
  var proximos = (APP.eventos||[])
    .filter(function(e){ return new Date(e.fecha+'T12:00') >= hoy; })
    .sort(function(a,b){ return new Date(a.fecha)-new Date(b.fecha); })
    .slice(0,6);
  if(!proximos.length){
    el.innerHTML='<div style="grid-column:1/-1;text-align:center;color:#888;padding:30px;font-size:14px;">📅 No hay eventos próximos registrados. Los eventos se mostrarán aquí cuando el centro los publique.</div>';
    return;
  }
  el.innerHTML = proximos.map(function(ev){
    var color = CAL_COLORS[ev.tipo]||'#3b82f6';
    var d = new Date(ev.fecha+'T12:00');
    var dias = Math.ceil((d-hoy)/(1000*60*60*24));
    var meses=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return '<div style="background:white;border-radius:16px;padding:20px;box-shadow:0 4px 16px rgba(0,0,0,.08);border-left:5px solid '+color+';display:flex;gap:14px;align-items:flex-start;">'
      +'<div style="text-align:center;min-width:52px;background:'+color+';border-radius:12px;padding:8px;">'
      +'<div style="color:white;font-size:22px;font-weight:800;line-height:1;">'+d.getDate()+'</div>'
      +'<div style="color:rgba(255,255,255,0.85);font-size:11px;">'+meses[d.getMonth()]+'</div>'
      +'</div>'
      +'<div style="flex:1;">'
      +'<div style="font-weight:700;font-size:14px;color:#1a2a50;margin-bottom:4px;">'+ev.titulo+'</div>'
      +'<div style="font-size:12px;color:#888;">'+ev.tipo+(ev.desc?' · '+ev.desc.slice(0,50):'')+'</div>'
      +'<div style="margin-top:6px;font-size:11px;font-weight:700;color:'+color+';">En '+dias+' día(s)</div>'
      +'</div></div>';
  }).join('');
}


// Render on initial load
setTimeout(renderPublicEventos, 800);


// ================================================================
//  🎓 CARRERAS TÉCNICAS — Admin editable, render público
// ================================================================

// Datos por defecto
if(!APP.carreras) APP.carreras = [
  {id:'C1', nombre:'Técnico en Medicina',    icon:'🏥', color:'#ef4444',
   desc:'Formación en ciencias de la salud, anatomía, primeros auxilios y asistencia médica básica.',
   uniforme:'Scrub/Bata blanca', duracion:'3 años (4°-6° Secundaria)'},
  {id:'C2', nombre:'Técnico en Multimedia',  icon:'🎥', color:'#8b5cf6',
   desc:'Diseño digital, edición de video, fotografía y producción de contenido audiovisual profesional.',
   uniforme:'Camisa y Pantalón de salida', duracion:'3 años (4°-6° Secundaria)'},
  {id:'C3', nombre:'Técnico en Gráfica',     icon:'🎨', color:'#f59e0b',
   desc:'Diseño gráfico, ilustración digital, identidad visual y artes aplicadas a la comunicación.',
   uniforme:'Camisa y Pantalón de salida (igual que Multimedia)', duracion:'3 años (4°-6° Secundaria)'},
];



function renderCarrerasAdmin(){
  var el = document.getElementById('carreras-admin-grid');
  if(!el) return;
  var carreras = APP.carreras || [];
  if(!carreras.length){
    el.innerHTML='<p style="color:#888;padding:20px;text-align:center;">No hay carreras. Agrega una con el botón +.</p>';
    return;
  }
  el.innerHTML = carreras.map(function(c,i){
    return '<div style="background:#f8fafc;border-radius:14px;border:1px solid var(--border);overflow:hidden;">'
      +'<div style="background:var(--navy);padding:16px;display:flex;align-items:center;gap:12px;">'
      +'<span style="font-size:32px;">'+c.icon+'</span>'
      +'<div><div style="font-weight:800;color:white;font-size:15px;">'+c.nombre+'</div>'
      +'<div style="font-size:11px;color:rgba(255,255,255,0.6);">'+c.duracion+'</div></div></div>'
      +'<div style="padding:14px 16px;">'
      +'<p style="font-size:13px;color:#555;margin:0 0 10px;line-height:1.5;">'+c.desc+'</p>'
      +'<div style="background:#e0f2fe;border-radius:8px;padding:6px 12px;font-size:12px;color:#0f4c75;font-weight:700;margin-bottom:12px;">👔 '+c.uniforme+'</div>'
      +'<div style="display:flex;gap:8px;">'
      +'<button onclick="editCarrera('+i+')" class="btn btn-outline" style="flex:1;font-size:12px;padding:6px;">✏️ Editar</button>'
      +'<button onclick="deleteCarrera('+i+')" style="background:#fee2e2;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;color:#dc2626;font-weight:700;">🗑️</button>'
      +'</div></div></div>';
  }).join('');
  // Also re-render public section
  renderCarrerasPublic();
}

function editCarrera(i){
  var c = APP.carreras[i];
  if(!c) return;
  document.getElementById('carrera-edit-id').value = i;
  document.getElementById('carrera-nombre').value   = c.nombre;
  document.getElementById('carrera-icon').value     = c.icon;
  document.getElementById('carrera-color').value    = c.color||'#d4af37';
  document.getElementById('carrera-desc').value     = c.desc;
  document.getElementById('carrera-uniforme').value = c.uniforme;
  document.getElementById('carrera-duracion').value = c.duracion||'';
  openModal('modal-carrera');
}

function saveCarrera(){
  var nombre   = (document.getElementById('carrera-nombre')  ||{}).value.trim();
  var icon     = (document.getElementById('carrera-icon')    ||{}).value.trim()||'🎓';
  var color    = (document.getElementById('carrera-color')   ||{}).value||'#d4af37';
  var desc     = (document.getElementById('carrera-desc')    ||{}).value.trim();
  var uniforme = (document.getElementById('carrera-uniforme')||{}).value.trim();
  var duracion = (document.getElementById('carrera-duracion')||{}).value.trim();
  var editId   = (document.getElementById('carrera-edit-id') ||{}).value;
  if(!nombre){toast('El nombre es obligatorio','error');return;}
  var item = {id:'C-'+Date.now(), nombre, icon, color, desc, uniforme, duracion};
  if(editId!==''){
    APP.carreras[parseInt(editId)] = Object.assign(APP.carreras[parseInt(editId)],item);
    toast('✅ Carrera actualizada','success');
  } else {
    APP.carreras.push(item);
    toast('✅ Carrera agregada','success');
  }
  persistSave();
  closeModal('modal-carrera');
  document.getElementById('carrera-edit-id').value='';
  renderCarrerasAdmin();
}

function deleteCarrera(i){
  if(!confirm('¿Eliminar esta carrera?')) return;
  APP.carreras.splice(i,1);
  persistSave();
  renderCarrerasAdmin();
  toast('Carrera eliminada','info');
}

// Render en la página pública (sección Bachilleratos Técnicos)
function renderCarrerasPublic(){
  var el = document.getElementById('bachilleratos-publicos');
  if(!el) return;
  var carreras = APP.carreras||[];
  el.innerHTML = carreras.map(function(c){
    return '<div style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:28px;text-align:center;backdrop-filter:blur(10px);">'
      +'<div style="font-size:48px;margin-bottom:14px;">'+c.icon+'</div>'
      +'<h3 style="color:#d4af37;font-size:18px;margin:0 0 10px;">'+c.nombre.replace('Técnico en ','')+'</h3>'
      +'<p style="color:rgba(255,255,255,0.7);font-size:13px;line-height:1.6;">'+c.desc+'</p>'
      +(c.duracion?'<div style="margin-top:8px;font-size:11px;color:rgba(255,255,255,0.45);">'+c.duracion+'</div>':'')
      +'<div style="margin-top:14px;background:rgba(212,175,55,0.2);border-radius:10px;padding:8px 12px;">'
      +'<span style="color:#d4af37;font-size:12px;font-weight:700;">👔 '+c.uniforme+'</span></div>'
      +'</div>';
  }).join('');
}

// Render carreras on load
setTimeout(renderCarrerasPublic, 500);

// ── Pagos Public Tabs ─────────────────────────────────────────────
function switchPagosTab(tabId){
  document.querySelectorAll('.pagos-tab-content').forEach(function(el){
    el.style.display = 'none';
  });
  var t = document.getElementById(tabId);
  if(t) t.style.display = 'block';
  // Update button styles
  ['tab-tarifas','tab-metodos','tab-inscripcion'].forEach(function(id){
    var btn = document.getElementById('tab-btn-'+id);
    if(!btn) return;
    if(id===tabId){
      btn.style.background = 'var(--gold)';
      btn.style.color = 'var(--navy)';
      btn.style.fontWeight = '800';
    } else {
      btn.style.background = 'rgba(255,255,255,0.15)';
      btn.style.color = 'white';
      btn.style.fontWeight = '700';
    }
  });
  // Render tarifas when that tab is shown
  if(tabId==='tab-tarifas') renderPagosPublic();
}

// ── Anuncios Públicos ─────────────────────────────────────────────
function renderAnunciosPublic(){
  var list   = document.getElementById('ann-public-list');
  var empty  = document.getElementById('ann-public-empty');
  var count  = document.getElementById('ann-pub-count');
  if(!list) return;

  var filtro = (document.getElementById('ann-pub-filter')||{}).value||'';
  var busq   = ((document.getElementById('ann-pub-search')||{}).value||'').toLowerCase();

  var anns = (APP.announcements||[]).filter(function(a){
    return (!filtro || a.tipo===filtro)
        && (!busq   || (a.titulo+' '+a.desc).toLowerCase().includes(busq));
  });

  if(count) count.textContent = anns.length + ' anuncio(s)';

  if(!anns.length){
    list.innerHTML=''; if(empty) empty.style.display='block'; return;
  }
  if(empty) empty.style.display='none';

  var colors = {urgente:'#ef4444',evento:'#3b82f6',info:'#22c55e',aviso:'#f59e0b'};
  var bgcols = {urgente:'#fee2e2',evento:'#dbeafe',info:'#dcfce7',aviso:'#fef3c7'};
  var labels = {urgente:'🔴 Urgente',evento:'🔵 Evento',info:'🟢 Informativo',aviso:'🟡 Aviso'};

  list.innerHTML = anns.map(function(a){
    var col = colors[a.tipo]||'#888';
    var bg  = bgcols[a.tipo]||'#f5f5f5';
    var lbl = labels[a.tipo]||a.tipo;
    return '<div style="background:white;border-radius:16px;padding:24px;margin-bottom:16px;box-shadow:0 2px 12px rgba(0,0,0,.06);border-left:5px solid '+col+';">'
      +'<div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;">'
      +(a.img?'<img src="'+a.img+'" style="width:80px;height:80px;border-radius:10px;object-fit:cover;flex-shrink:0;">':'')
      +'<div style="flex:1;min-width:0;">'
      +'<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">'
      +'<span style="background:'+bg+';color:'+col+';padding:3px 12px;border-radius:20px;font-size:11px;font-weight:800;">'+lbl+'</span>'
      +(a.fecha?'<span style="color:#888;font-size:12px;">📅 '+a.fecha+'</span>':'')
      +'</div>'
      +'<h3 style="margin:0 0 8px;color:var(--navy);font-size:16px;font-weight:800;">'+a.titulo+'</h3>'
      +'<p style="margin:0;color:#555;font-size:14px;line-height:1.6;">'+a.desc+'</p>'
      +'</div></div></div>';
  }).join('');
}


// ================================================================
//  📰 BLOG / NOTICIAS
// ================================================================
if(!APP.blog) APP.blog = [];


function saveBlog(){
  var titulo    = (document.getElementById('blog-titulo')    ||{}).value.trim();
  var resumen   = (document.getElementById('blog-resumen')   ||{}).value.trim();
  var contenido = (document.getElementById('blog-contenido') ||{}).value.trim();
  var categoria = (document.getElementById('blog-categoria') ||{}).value||'Noticia';
  var autor     = (document.getElementById('blog-autor')     ||{}).value.trim()||'Dirección';
  var imagen    = (document.getElementById('blog-imagen')    ||{}).value.trim();
  var destacado = (document.getElementById('blog-destacado') ||{}).checked;
  var editId    = (document.getElementById('blog-edit-id')   ||{}).value;
  if(!titulo||!resumen){toast('Título y resumen son obligatorios','error');return;}
  var item = {
    id: editId || 'B-'+Date.now(),
    titulo, resumen, contenido, categoria, autor, imagen, destacado,
    fecha: new Date().toLocaleDateString('es-DO'),
    fechaISO: new Date().toISOString().split('T')[0]
  };
  if(editId){
    var idx = APP.blog.findIndex(function(b){return b.id===editId;});
    if(idx>-1) APP.blog[idx] = item; else APP.blog.unshift(item);
  } else {
    APP.blog.unshift(item);
  }
  persistSave();
  closeModal('modal-blog');
  ['blog-titulo','blog-resumen','blog-contenido','blog-autor','blog-imagen'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('blog-edit-id').value='';
  document.getElementById('blog-destacado').checked=false;
  renderBlogAdmin();
  toast('✅ Publicación guardada','success');
}

function editBlog(id){
  var b = APP.blog.find(function(b){return b.id===id;});
  if(!b) return;
  document.getElementById('blog-edit-id').value  = b.id;
  document.getElementById('blog-titulo').value    = b.titulo;
  document.getElementById('blog-resumen').value   = b.resumen;
  document.getElementById('blog-contenido').value = b.contenido||'';
  document.getElementById('blog-categoria').value = b.categoria||'Noticia';
  document.getElementById('blog-autor').value     = b.autor||'';
  document.getElementById('blog-imagen').value    = b.imagen||'';
  document.getElementById('blog-destacado').checked = !!b.destacado;
  openModal('modal-blog');
}

function deleteBlog(id){
  if(!confirm('¿Eliminar esta publicación?')) return;
  APP.blog = APP.blog.filter(function(b){return b.id!==id;});
  persistSave(); renderBlogAdmin(); toast('Publicación eliminada','info');
}

function renderBlogAdmin(){
  var el = document.getElementById('blog-admin-list');
  if(!el) return;
  if(!APP.blog.length){el.innerHTML='<p style="color:#888;padding:20px;text-align:center;">No hay publicaciones. Agrega una con el botón +.</p>';return;}
  var catColors={Noticia:'#3b82f6',Logro:'#d4af37',Evento:'#8b5cf6',Académico:'#16a34a'};
  el.innerHTML = '<div style="display:grid;gap:14px;">' +
    APP.blog.map(function(b){
      var col = catColors[b.categoria]||'#888';
      return '<div style="background:white;border-radius:14px;padding:18px;border:1px solid var(--border);border-left:4px solid '+col+';display:flex;gap:16px;align-items:flex-start;">'
        +(b.imagen?'<img src="'+b.imagen+'" style="width:80px;height:80px;border-radius:10px;object-fit:cover;flex-shrink:0;">':'<div style="width:80px;height:80px;border-radius:10px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;">📰</div>')
        +'<div style="flex:1;min-width:0;">'
        +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">'
        +'<span style="background:'+col+';color:white;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:800;">'+b.categoria+'</span>'
        +(b.destacado?'<span style="background:#fef3c7;color:#d4af37;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:800;">⭐ Destacada</span>':'')
        +'<span style="color:#888;font-size:11px;">'+b.fecha+'</span>'
        +'</div>'
        +'<h4 style="margin:0 0 4px;color:var(--navy);font-size:14px;">'+b.titulo+'</h4>'
        +'<p style="margin:0 0 10px;color:#666;font-size:12px;line-height:1.5;">'+b.resumen+'</p>'
        +'<div style="display:flex;gap:8px;">'
        +'<button onclick="editBlog(\''+b.id+'\')" class="btn btn-outline" style="font-size:11px;padding:4px 12px;">✏️ Editar</button>'
        +'<button onclick="deleteBlog(\''+b.id+'\')" style="background:#fee2e2;border:none;border-radius:8px;padding:4px 12px;cursor:pointer;font-size:11px;color:#dc2626;font-weight:700;">🗑️</button>'
        +'</div></div></div>';
    }).join('') + '</div>';
}

function renderBlogPublic(){
  var list  = document.getElementById('blog-public-list');
  var empty = document.getElementById('blog-public-empty');
  if(!list) return;
  var filtro = (document.getElementById('blog-pub-filter')||{}).value||'';
  var busq   = ((document.getElementById('blog-pub-search')||{}).value||'').toLowerCase();
  var items  = (APP.blog||[])
    .filter(function(b){ return (!filtro||b.categoria===filtro)&&(!busq||(b.titulo+' '+b.resumen).toLowerCase().includes(busq)); })
    .sort(function(a,b){ return (b.destacado?1:0)-(a.destacado?1:0); });
  if(!items.length){list.innerHTML='';if(empty)empty.style.display='block';return;}
  if(empty) empty.style.display='none';
  var catColors={Noticia:'#3b82f6',Logro:'#d4af37',Evento:'#8b5cf6',Académico:'#16a34a'};
  list.innerHTML='<div style="display:grid;gap:20px;">'+items.map(function(b){
    var col=catColors[b.categoria]||'#888';
    return '<div style="background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.07);display:flex;flex-direction:column;">'
      +(b.imagen?'<img src="'+b.imagen+'" style="width:100%;height:200px;object-fit:cover;">':'<div style="width:100%;height:120px;background:linear-gradient(135deg,var(--navy),var(--blue));display:flex;align-items:center;justify-content:center;font-size:48px;">📰</div>')
      +'<div style="padding:24px;">'
      +'<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">'
      +'<span style="background:'+col+';color:white;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:800;">'+b.categoria+'</span>'
      +(b.destacado?'<span style="background:#fef3c7;color:#d4af37;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:800;">⭐ Destacado</span>':'')
      +'</div>'
      +'<h3 style="margin:0 0 10px;color:var(--navy);font-size:20px;font-family:\'Playfair Display\',serif;">'+b.titulo+'</h3>'
      +'<p style="margin:0 0 14px;color:#666;font-size:14px;line-height:1.7;">'+b.resumen+'</p>'
      +(b.contenido?'<p style="margin:0 0 14px;color:#444;font-size:13px;line-height:1.8;border-top:1px solid #f0f0f0;padding-top:12px;">'+b.contenido+'</p>':'')
      +'<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#888;margin-top:auto;">'
      +'<span>✍️ '+b.autor+'</span><span>📅 '+b.fecha+'</span>'
      +'</div></div></div>';
  }).join('')+'</div>';
}

// ================================================================
//  🎓 EGRESADOS
// ================================================================
if(!APP.egresados) APP.egresados = [];


function saveEgresado(){
  var nombre    = (document.getElementById('egresado-nombre')    ||{}).value.trim();
  var apellido  = (document.getElementById('egresado-apellido')  ||{}).value.trim();
  var año       = parseInt((document.getElementById('egresado-año')||{}).value)||new Date().getFullYear();
  var carrera   = (document.getElementById('egresado-carrera')   ||{}).value||'General';
  var logro     = (document.getElementById('egresado-logro')     ||{}).value.trim();
  var foto      = (document.getElementById('egresado-foto')      ||{}).value.trim();
  var destino   = (document.getElementById('egresado-destino')   ||{}).value.trim();
  var destacado = (document.getElementById('egresado-destacado') ||{}).checked;
  var editId    = (document.getElementById('egresado-edit-id')   ||{}).value;
  if(!nombre||!apellido){toast('Nombre y apellido son obligatorios','error');return;}
  var item = {id:editId||'E-'+Date.now(), nombre, apellido, año, carrera, logro, foto, destino, destacado};
  if(editId){
    var idx=APP.egresados.findIndex(function(e){return e.id===editId;});
    if(idx>-1) APP.egresados[idx]=item; else APP.egresados.push(item);
  } else {
    APP.egresados.push(item);
  }
  persistSave(); closeModal('modal-egresado');
  document.getElementById('egresado-edit-id').value='';
  ['egresado-nombre','egresado-apellido','egresado-logro','egresado-foto','egresado-destino'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  renderEgresadosAdmin(); renderEgresadosPublic();
  toast('✅ Egresado guardado','success');
}

function editEgresado(id){
  var e=APP.egresados.find(function(e){return e.id===id;});
  if(!e) return;
  document.getElementById('egresado-edit-id').value=e.id;
  document.getElementById('egresado-nombre').value=e.nombre;
  document.getElementById('egresado-apellido').value=e.apellido;
  document.getElementById('egresado-año').value=e.año;
  document.getElementById('egresado-carrera').value=e.carrera||'General';
  document.getElementById('egresado-logro').value=e.logro||'';
  document.getElementById('egresado-foto').value=e.foto||'';
  document.getElementById('egresado-destino').value=e.destino||'';
  document.getElementById('egresado-destacado').checked=!!e.destacado;
  openModal('modal-egresado');
}

function deleteEgresado(id){
  if(!confirm('¿Eliminar este egresado?')) return;
  APP.egresados=APP.egresados.filter(function(e){return e.id!==id;});
  persistSave(); renderEgresadosAdmin(); toast('Eliminado','info');
}

function renderEgresadosAdmin(){
  var el=document.getElementById('egresados-admin-grid');
  if(!el) return;
  // Populate year filter
  var años=[...new Set((APP.egresados||[]).map(function(e){return e.año;}))].sort(function(a,b){return b-a;});
  var filtAño=(document.getElementById('egresado-filter-año')||{});
  if(filtAño && filtAño.options && filtAño.options.length<=1){
    años.forEach(function(a){var o=document.createElement('option');o.value=a;o.textContent=a;filtAño.appendChild(o);});
  }
  var busq=((document.getElementById('egresado-search')||{}).value||'').toLowerCase();
  var fAño=(document.getElementById('egresado-filter-año')||{}).value||'';
  var fCar=(document.getElementById('egresado-filter-carrera')||{}).value||'';
  var items=(APP.egresados||[]).filter(function(e){
    return (!busq||(e.nombre+' '+e.apellido).toLowerCase().includes(busq))
        && (!fAño||e.año==fAño)&&(!fCar||e.carrera===fCar);
  }).sort(function(a,b){return b.año-a.año||(b.destacado?1:0)-(a.destacado?1:0);});
  if(!items.length){el.innerHTML='<p style="color:#888;padding:20px;grid-column:1/-1;text-align:center;">No hay egresados. Agrega uno con el botón +.</p>';return;}
  el.innerHTML=items.map(function(e){
    return '<div style="background:white;border-radius:14px;padding:16px;border:1px solid var(--border);text-align:center;position:relative;">'
      +(e.destacado?'<div style="position:absolute;top:10px;right:10px;background:#fef3c7;border-radius:20px;padding:2px 8px;font-size:10px;font-weight:800;color:#d4af37;">⭐</div>':'')
      +(e.foto?'<img src="'+e.foto+'" style="width:70px;height:70px;border-radius:50%;object-fit:cover;margin:0 auto 10px;display:block;border:3px solid var(--gold);">'
              :'<div style="width:70px;height:70px;border-radius:50%;background:linear-gradient(135deg,var(--navy),var(--blue));margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-size:28px;color:white;">🎓</div>')
      +'<div style="font-weight:800;color:var(--navy);font-size:14px;">'+e.nombre+' '+e.apellido+'</div>'
      +'<div style="font-size:12px;color:var(--gold);font-weight:700;margin:3px 0;">Promoción '+e.año+'</div>'
      +'<div style="font-size:11px;color:#888;margin-bottom:8px;">'+e.carrera+(e.destino?' · '+e.destino:'')+'</div>'
      +(e.logro?'<div style="background:#fef3c7;border-radius:8px;padding:4px 10px;font-size:11px;color:#7a5c00;margin-bottom:8px;">🏆 '+e.logro+'</div>':'')
      +'<div style="display:flex;gap:6px;justify-content:center;">'
      +'<button onclick="editEgresado(\''+e.id+'\')" class="btn btn-outline" style="font-size:11px;padding:4px 10px;">✏️</button>'
      +'<button onclick="deleteEgresado(\''+e.id+'\')" style="background:#fee2e2;border:none;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:11px;color:#dc2626;">🗑️</button>'
      +'</div></div>';
  }).join('');
}

function renderEgresadosPublic(){
  var list=document.getElementById('egresados-public-list');
  if(!list) return;
  var total=document.getElementById('ego-total-count');
  var promos=document.getElementById('ego-promo-count');
  var busq=((document.getElementById('ego-pub-search')||{}).value||'').toLowerCase();
  var fAño=(document.getElementById('ego-pub-año')||{}).value||'';
  var fCar=(document.getElementById('ego-pub-carrera')||{}).value||'';
  var egresados=APP.egresados||[];
  // Populate year filter
  var años=[...new Set(egresados.map(function(e){return e.año;}))].sort(function(a,b){return b-a;});
  var selAño=document.getElementById('ego-pub-año');
  if(selAño&&selAño.options.length<=1) años.forEach(function(a){var o=document.createElement('option');o.value=a;o.textContent='Promoción '+a;selAño.appendChild(o);});
  if(total) total.textContent=egresados.length;
  if(promos) promos.textContent=años.length;
  var filtered=egresados.filter(function(e){
    return (!busq||(e.nombre+' '+e.apellido).toLowerCase().includes(busq))
        &&(!fAño||e.año==fAño)&&(!fCar||e.carrera===fCar);
  }).sort(function(a,b){return b.año-a.año||(b.destacado?1:0)-(a.destacado?1:0);});
  if(!filtered.length){list.innerHTML='<div style="text-align:center;padding:50px;color:#888;"><div style="font-size:40px;margin-bottom:10px;">🎓</div><p>No hay egresados que coincidan.</p></div>';return;}
  // Group by year
  var byYear={};
  filtered.forEach(function(e){if(!byYear[e.año])byYear[e.año]=[];byYear[e.año].push(e);});
  list.innerHTML=Object.keys(byYear).sort(function(a,b){return b-a;}).map(function(año){
    var promo=byYear[año];
    return '<div style="margin-bottom:36px;">'
      +'<div style="background:linear-gradient(135deg,var(--navy),var(--blue));border-radius:16px;padding:16px 24px;margin-bottom:16px;display:flex;align-items:center;gap:16px;">'
      +'<div style="font-size:32px;">🎓</div>'
      +'<div><h3 style="color:white;margin:0;font-family:\'Playfair Display\',serif;">Promoción '+año+'</h3>'
      +'<div style="color:var(--gold);font-size:13px;font-weight:700;">'+promo.length+' egresado(s)</div></div></div>'
      +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;">'
      +promo.map(function(e){
        return '<div style="background:white;border-radius:14px;padding:16px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.07);border:1px solid var(--border);position:relative;">'
          +(e.destacado?'<div style="position:absolute;top:8px;right:8px;font-size:14px;">⭐</div>':'')
          +(e.foto?'<img src="'+e.foto+'" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin:0 auto 8px;display:block;border:3px solid var(--gold);">'
                  :'<div style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,var(--navy),var(--blue));margin:0 auto 8px;display:flex;align-items:center;justify-content:center;font-size:24px;color:white;">🎓</div>')
          +'<div style="font-weight:800;color:var(--navy);font-size:13px;">'+e.nombre+'<br>'+e.apellido+'</div>'
          +'<div style="font-size:11px;color:#888;margin:4px 0;">'+e.carrera+'</div>'
          +(e.logro?'<div style="font-size:10px;color:#d4af37;font-weight:700;">🏆 '+e.logro+'</div>':'')
          +(e.destino?'<div style="font-size:10px;color:#666;margin-top:4px;">📍 '+e.destino+'</div>':'')
          +'</div>';
      }).join('')
      +'</div></div>';
  }).join('');
}

// ================================================================
//  👨‍🏫 MAESTROS ADMIN
// ================================================================
if(!APP.maestrosPublicos) APP.maestrosPublicos = [
  {id:'M1',nombre:'Sor Cesarina A. Paulino Fernández',cargo:'Directora Docente',nivel:'Dirección',icon:'👩‍💼',desc:'Más de 20 años liderando el centro con dedicación.',directivo:true},
  {id:'M2',nombre:'Coordinador Académico',cargo:'Coordinación Curricular',nivel:'Dirección',icon:'👨‍💼',desc:'Responsable del currículo educativo.',directivo:true},
  {id:'M3',nombre:'Orientadora Escolar',cargo:'Orientación y Consejería',nivel:'Dirección',icon:'👩‍💼',desc:'Acompañamiento a estudiantes y familias.',directivo:true},
  {id:'M4',nombre:'Maestra de Matemáticas',cargo:'Matemáticas',nivel:'Primaria / Secundaria',icon:'👩‍🏫',desc:'',directivo:false},
  {id:'M5',nombre:'Maestro de Ciencias',cargo:'Ciencias Naturales',nivel:'Secundaria',icon:'👨‍🏫',desc:'',directivo:false},
  {id:'M6',nombre:'Maestra de Lengua',cargo:'Lengua Española',nivel:'Primaria',icon:'👩‍🏫',desc:'',directivo:false},
  {id:'M7',nombre:'Maestro de Inglés',cargo:'Inglés',nivel:'Todos los niveles',icon:'👨‍🏫',desc:'',directivo:false},
  {id:'M8',nombre:'Maestro de Ed. Física',cargo:'Educación Física',nivel:'Todos los niveles',icon:'👨‍🏫',desc:'',directivo:false},
];


function saveMaestroAdmin(){
  var nombre   =(document.getElementById('maestro-nombre')   ||{}).value.trim();
  var cargo    =(document.getElementById('maestro-cargo')    ||{}).value.trim();
  var nivel    =(document.getElementById('maestro-nivel')    ||{}).value||'Todos los niveles';
  var icon     =(document.getElementById('maestro-icon')     ||{}).value.trim()||'👨‍🏫';
  var desc     =(document.getElementById('maestro-desc')     ||{}).value.trim();
  var foto     =(document.getElementById('maestro-foto')     ||{}).value.trim();
  var directivo=(document.getElementById('maestro-directivo')||{}).checked;
  var editId   =(document.getElementById('maestro-edit-id')  ||{}).value;
  if(!nombre){toast('El nombre es obligatorio','error');return;}
  var item={id:editId||'M-'+Date.now(),nombre,cargo,nivel,icon,desc,foto,directivo};
  if(editId){
    var idx=APP.maestrosPublicos.findIndex(function(m){return m.id===editId;});
    if(idx>-1) APP.maestrosPublicos[idx]=item; else APP.maestrosPublicos.push(item);
  } else { APP.maestrosPublicos.push(item); }
  persistSave(); closeModal('modal-maestro-admin');
  document.getElementById('maestro-edit-id').value='';
  ['maestro-nombre','maestro-cargo','maestro-icon','maestro-desc','maestro-foto'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  renderMaestrosAdmin(); renderMaestrosPublic();
  toast('✅ Maestro guardado','success');
}

function editMaestroAdmin(id){
  var m=APP.maestrosPublicos.find(function(m){return m.id===id;});
  if(!m) return;
  document.getElementById('maestro-edit-id').value=m.id;
  document.getElementById('maestro-nombre').value=m.nombre;
  document.getElementById('maestro-cargo').value=m.cargo;
  document.getElementById('maestro-nivel').value=m.nivel||'Todos los niveles';
  document.getElementById('maestro-icon').value=m.icon||'👨‍🏫';
  document.getElementById('maestro-desc').value=m.desc||'';
  document.getElementById('maestro-foto').value=m.foto||'';
  document.getElementById('maestro-directivo').checked=!!m.directivo;
  openModal('modal-maestro-admin');
}

function deleteMaestroAdmin(id){
  if(!confirm('¿Eliminar este maestro?')) return;
  APP.maestrosPublicos=APP.maestrosPublicos.filter(function(m){return m.id!==id;});
  persistSave(); renderMaestrosAdmin(); renderMaestrosPublic();
  toast('Maestro eliminado','info');
}

function renderMaestrosAdmin(){
  var el=document.getElementById('maestros-admin-grid');
  if(!el) return;
  var items=APP.maestrosPublicos||[];
  if(!items.length){el.innerHTML='<p style="color:#888;padding:20px;text-align:center;">No hay maestros configurados.</p>';return;}
  el.innerHTML=items.map(function(m){
    return '<div style="background:white;border-radius:14px;padding:16px;border:1px solid var(--border);text-align:center;">'
      +(m.foto?'<img src="'+m.foto+'" style="width:64px;height:64px;border-radius:50%;object-fit:cover;margin:0 auto 10px;display:block;border:3px solid var(--gold);">'
              :'<div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--navy),var(--blue));margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-size:26px;">'+m.icon+'</div>')
      +(m.directivo?'<div style="background:#fef3c7;border-radius:10px;padding:2px 8px;font-size:10px;color:#7a5c00;font-weight:800;margin-bottom:6px;display:inline-block;">🏫 Directivo</div>':'')
      +'<div style="font-weight:800;color:var(--navy);font-size:13px;margin-bottom:3px;">'+m.nombre+'</div>'
      +'<div style="font-size:11px;color:var(--gold);font-weight:700;margin-bottom:3px;">'+m.cargo+'</div>'
      +'<div style="font-size:11px;color:#888;margin-bottom:10px;">'+m.nivel+'</div>'
      +'<div style="display:flex;gap:6px;justify-content:center;">'
      +'<button onclick="editMaestroAdmin(\''+m.id+'\')" class="btn btn-outline" style="font-size:11px;padding:4px 10px;">✏️</button>'
      +'<button onclick="deleteMaestroAdmin(\''+m.id+'\')" style="background:#fee2e2;border:none;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:11px;color:#dc2626;">🗑️</button>'
      +'</div></div>';
  }).join('');
}

function renderMaestrosPublic(){
  // Update public page-maestros
  var grid=document.getElementById('maestros-grid');
  var directivos=document.getElementById('equipo-directivo-grid');
  if(!APP.maestrosPublicos) return;
  var dirs=APP.maestrosPublicos.filter(function(m){return m.directivo;});
  var docentes=APP.maestrosPublicos.filter(function(m){return !m.directivo;});
  function card(m){
    return '<div class="maestro-card">'
      +(m.foto?'<img src="'+m.foto+'" style="width:80px;height:80px;border-radius:50%;object-fit:cover;margin:0 auto 10px;display:block;border:3px solid var(--gold);">'
              :'<div class="maestro-foto">'+m.icon+'</div>')
      +'<h4>'+m.nombre+'</h4>'
      +'<span class="maestro-cargo">'+m.cargo+'</span>'
      +(m.desc?'<p>'+m.desc+'</p>':'')
      +'</div>';
  }
  if(directivos.length&&grid) directivos.innerHTML=dirs.map(card).join('');
  if(grid) grid.innerHTML=docentes.map(card).join('');
}

// ================================================================
//  📊 DASHBOARD GRÁFICAS ANIMADAS
// ================================================================
function renderAdminDashboard(){
  var consultas=(APP.consultas||[]);
  var hoy=new Date().toLocaleDateString('es-DO');
  // KPI extra
  var mesActual=new Date().getMonth();
  var ingMes=(APP.pagos||[]).filter(function(p){
    return p.fecha&&new Date(p.fechaISO+'T12:00').getMonth()===mesActual;
  }).reduce(function(s,p){return s+(parseFloat(p.monto)||0);},0);
  var kpiI=document.getElementById('kpi-ingresos');
  var kpiC=document.getElementById('kpi-consultas');
  if(kpiI) kpiI.textContent='RD$ '+ingMes.toLocaleString();
  if(kpiC) kpiC.textContent=consultas.filter(function(c){return c.fecha===hoy;}).length;

  renderChartAsistencia();
  renderChartIngresos();
  renderChartGrados();
  renderActividadReciente();
  renderDonutAprobacion();
  renderDonutPromedio();
  renderStockCritico();
}

function barChart(elId, data, color){
  var el=document.getElementById(elId);
  if(!el||!data.length) return;
  var max=Math.max(1,...data.map(function(d){return d.v;}));
  el.innerHTML='<div style="display:flex;gap:4px;align-items:flex-end;height:100%;width:100%;padding:0 4px;">'
    +data.map(function(d){
      var h=Math.max(6,Math.round((d.v/max)*100));
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:default;" title="'+d.l+': '+d.v+'">'
        +'<span style="font-size:9px;font-weight:700;color:'+color+';">'+d.v+'</span>'
        +'<div style="width:100%;border-radius:4px 4px 0 0;background:'+color+';height:'+h+'%;min-height:6px;transition:height .6s ease;"></div>'
        +'<span style="font-size:8px;color:#999;white-space:nowrap;overflow:hidden;max-width:28px;">'+d.l+'</span>'
        +'</div>';
    }).join('')+'</div>';
}

function renderChartAsistencia(){
  var meses=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var counts=Array(12).fill(0);
  (APP.ausencias||[]).forEach(function(a){
    var d=new Date(a.fecha+'T12:00'); if(!isNaN(d)) counts[d.getMonth()]++;
  });
  barChart('chart-asistencia',meses.map(function(l,i){return{l:l,v:counts[i]};}), '#ef4444');
}

function renderChartIngresos(){
  var meses=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var totals=Array(12).fill(0);
  (APP.pagos||[]).forEach(function(p){
    var d=new Date((p.fechaISO||'')+'T12:00'); if(!isNaN(d)) totals[d.getMonth()]+=(parseFloat(p.monto)||0);
  });
  barChart('chart-ingresos',meses.map(function(l,i){return{l:l,v:Math.round(totals[i])};}), 'var(--gold)');
}

function renderChartGrados(){
  var el=document.getElementById('chart-grados');
  if(!el) return;
  var grados={};
  (APP.students||[]).forEach(function(s){grados[s.grado]=(grados[s.grado]||0)+1;});
  var total=Math.max(1,(APP.students||[]).length);
  var entries=Object.entries(grados).sort(function(a,b){return b[1]-a[1];}).slice(0,8);
  el.innerHTML=entries.map(function(e){
    var pct=Math.round((e[1]/total)*100);
    return '<div>'
      +'<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">'
      +'<span style="color:#555;font-weight:600;">'+e[0]+'</span>'
      +'<span style="color:var(--navy);font-weight:800;">'+e[1]+'</span></div>'
      +'<div style="height:8px;background:#f0f0f0;border-radius:4px;">'
      +'<div style="height:100%;width:'+pct+'%;background:linear-gradient(90deg,var(--navy),var(--blue));border-radius:4px;transition:width .6s;"></div>'
      +'</div></div>';
  }).join('');
}

function renderActividadReciente(){
  var el=document.getElementById('admin-actividad-reciente');
  if(!el) return;
  var log=(APP.auditLog||[]).slice(0,10);
  if(!log.length){el.innerHTML='<p style="color:#888;font-size:13px;padding:10px;">Sin actividad reciente.</p>';return;}
  el.innerHTML=log.map(function(a){
    return '<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #f5f5f5;">'
      +'<div style="width:8px;height:8px;border-radius:50%;background:var(--gold);margin-top:5px;flex-shrink:0;"></div>'
      +'<div style="flex:1;min-width:0;">'
      +'<div style="font-size:12px;color:#333;line-height:1.4;">'+a.desc+'</div>'
      +'<div style="font-size:10px;color:#888;margin-top:2px;">'+a.fecha+' '+a.hora+'</div>'
      +'</div></div>';
  }).join('');
}

function drawDonut(canvasId, pct, color){
  var canvas=document.getElementById(canvasId);
  if(!canvas||!canvas.getContext) return;
  var ctx=canvas.getContext('2d');
  var cx=70,cy=70,r=55,lw=14;
  ctx.clearRect(0,0,140,140);
  // Background ring
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.strokeStyle='#f0f0f0'; ctx.lineWidth=lw; ctx.stroke();
  // Value arc
  var end=(pct/100)*Math.PI*2 - Math.PI/2;
  ctx.beginPath(); ctx.arc(cx,cy,r,-Math.PI/2,end);
  ctx.strokeStyle=color; ctx.lineWidth=lw;
  ctx.lineCap='round'; ctx.stroke();
}

function renderDonutAprobacion(){
  var notas=APP.notas||[];
  if(!notas.length){drawDonut('donut-aprobacion',0,'#16a34a');return;}
  var aprobados=notas.filter(function(n){return parseFloat(n.nota)>=65;}).length;
  var pct=Math.round((aprobados/notas.length)*100);
  drawDonut('donut-aprobacion',pct,'#16a34a');
  var lbl=document.getElementById('donut-aprobacion-label');
  if(lbl) lbl.textContent=pct+'%';
}

function renderDonutPromedio(){
  var notas=APP.notas||[];
  if(!notas.length){drawDonut('donut-promedio',0,'var(--gold)');return;}
  var avg=notas.reduce(function(s,n){return s+(parseFloat(n.nota)||0);},0)/notas.length;
  drawDonut('donut-promedio',(avg/100)*100,'var(--gold)');
  var lbl=document.getElementById('donut-promedio-label');
  if(lbl) lbl.textContent=avg.toFixed(1);
}

function renderStockCritico(){
  var el=document.getElementById('stock-critico-list');
  if(!el) return;
  var bajos=(APP.stockEnfer||[]).filter(function(s){return s.cantidad<=s.minimo;});
  if(!bajos.length){el.innerHTML='<div style="text-align:center;padding:20px;"><div style="font-size:32px;">✅</div><p style="color:#16a34a;font-size:13px;margin-top:8px;font-weight:700;">Todo en orden</p></div>';return;}
  el.innerHTML=bajos.slice(0,5).map(function(s){
    return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f5f5f5;font-size:12px;">'
      +'<span style="color:#555;">'+s.nombre+'</span>'
      +'<span style="color:#ef4444;font-weight:800;">'+s.cantidad+' '+s.unidad+'</span>'
      +'</div>';
  }).join('')+'<p style="font-size:11px;color:#888;margin-top:8px;text-align:center;">'+bajos.length+' ítem(s) bajo stock mínimo</p>';
}

// Hook dashboard to renderAdminData
var _origRenderAdminData2 = renderAdminData;
renderAdminData = function(){
  _origRenderAdminData2();
  setTimeout(renderAdminDashboard, 100);
  setTimeout(renderMaestrosPublic, 200);
};

// Hook showPage for new pages
var _spBlogEgo = showPage;

// Add blog and egresados links to navbar
setTimeout(function(){
  // Auto-render on load
  renderMaestrosPublic();
}, 800);

// ================================================================
//  📊 GRÁFICA DE NOTAS POR TRIMESTRE (Portal Estudiante)
// ================================================================
function renderGraficaNotas(studentId){
  var el = document.getElementById('grafica-notas-est');
  if(!el) return;
  var notas = (APP.notas||[]).filter(function(n){ return n.studentId===studentId||n.email===studentId; });
  if(!notas.length){
    el.innerHTML='<p style="color:#888;text-align:center;padding:20px;">Sin notas registradas aún.</p>';
    return;
  }
  // Group by trimestre
  var trimestres={'1er Trimestre':[],'2do Trimestre':[],'3er Trimestre':[]};
  notas.forEach(function(n){
    var t=n.trimestre||n.periodo||'1er Trimestre';
    if(!trimestres[t]) trimestres[t]=[];
    trimestres[t].push(parseFloat(n.nota)||0);
  });
  var avgs=Object.keys(trimestres).map(function(t){
    var arr=trimestres[t];
    return {l:t.replace(' Trimestre','° Trim.'), v:arr.length?Math.round(arr.reduce(function(s,n){return s+n;},0)/arr.length):0};
  });
  // By subject chart
  var materias={};
  notas.forEach(function(n){
    if(!materias[n.materia]) materias[n.materia]=[];
    materias[n.materia].push(parseFloat(n.nota)||0);
  });
  var matData=Object.keys(materias).map(function(m){
    var arr=materias[m];
    return {materia:m, avg:Math.round(arr.reduce(function(s,n){return s+n;},0)/arr.length)};
  }).sort(function(a,b){return b.avg-a.avg;});

  var colors={get:function(v){return v>=90?'#16a34a':v>=75?'var(--gold)':v>=65?'#f59e0b':'#ef4444';}};
  var maxA=Math.max(1,...avgs.map(function(a){return a.v;}));

  el.innerHTML =
    '<div style="margin-bottom:20px;">'
    +'<h4 style="color:var(--navy);font-weight:700;margin:0 0 14px;font-size:14px;">📈 Promedio por Trimestre</h4>'
    +'<div style="display:flex;gap:8px;align-items:flex-end;height:100px;">'
    +avgs.map(function(a){
      var h=maxA>0?Math.max(10,Math.round((a.v/maxA)*100)):10;
      var col=colors.get(a.v);
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">'
        +'<span style="font-size:12px;font-weight:800;color:'+col+';">'+a.v+'</span>'
        +'<div style="width:100%;border-radius:6px 6px 0 0;background:'+col+';height:'+h+'px;transition:height .6s;"></div>'
        +'<span style="font-size:10px;color:#888;text-align:center;">'+a.l+'</span>'
        +'</div>';
    }).join('')
    +'</div></div>'
    +'<div>'
    +'<h4 style="color:var(--navy);font-weight:700;margin:0 0 12px;font-size:14px;">📚 Promedio por Materia</h4>'
    +matData.map(function(m){
      var col=colors.get(m.avg);
      var pct=Math.round((m.avg/100)*100);
      return '<div style="margin-bottom:8px;">'
        +'<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">'
        +'<span style="color:#555;font-weight:600;">'+m.materia+'</span>'
        +'<span style="font-weight:800;color:'+col+';">'+m.avg+'</span></div>'
        +'<div style="height:8px;background:#f0f0f0;border-radius:4px;">'
        +'<div style="height:100%;width:'+pct+'%;background:'+col+';border-radius:4px;transition:width .6s;"></div>'
        +'</div></div>';
    }).join('')
    +'</div>';
}

// ================================================================
//  📰 BLOG / NOTICIAS
// ================================================================
if(!APP.blog) APP.blog = [];


const BLOG_CATS = {
  logro:        {label:'🏆 Logro',        color:'#d4af37', bg:'#fef9c3'},
  actividad:    {label:'🎉 Actividad',     color:'#8b5cf6', bg:'#ede9fe'},
  academico:    {label:'📚 Académico',     color:'#2563eb', bg:'#dbeafe'},
  deportivo:    {label:'⚽ Deportivo',     color:'#16a34a', bg:'#dcfce7'},
  tecnico:      {label:'💻 Técnico',       color:'#0f4c75', bg:'#e0f2fe'},
  institucional:{label:'🏫 Institucional', color:'#dc2626', bg:'#fee2e2'},
};

function saveBlog(){
  var titulo   = (document.getElementById('blog-titulo')   ||{}).value.trim();
  var resumen  = (document.getElementById('blog-resumen')  ||{}).value.trim();
  if(!titulo||!resumen){ toast('Título y resumen son obligatorios','error'); return; }
  var editId = (document.getElementById('blog-edit-id')||{}).value;
  var item = {
    id: editId || 'B-'+Date.now(),
    titulo,
    resumen,
    contenido: (document.getElementById('blog-contenido')||{}).value.trim(),
    cat:       (document.getElementById('blog-cat')      ||{}).value || 'institucional',
    fecha:     (document.getElementById('blog-fecha')    ||{}).value || new Date().toISOString().split('T')[0],
    img:       (document.getElementById('blog-img')      ||{}).value.trim(),
    autor:     (document.getElementById('blog-autor')    ||{}).value.trim() || 'Dirección del Centro',
    ts:        Date.now(),
  };
  if(editId){
    var idx = APP.blog.findIndex(function(b){ return b.id===editId; });
    if(idx>-1) APP.blog[idx] = item;
  } else {
    APP.blog.unshift(item);
  }
  persistSave();
  closeModal('modal-blog');
  document.getElementById('blog-edit-id').value = '';
  ['blog-titulo','blog-resumen','blog-contenido','blog-img','blog-autor'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  renderBlogAdmin();
  toast('✅ Noticia publicada','success');
  logAudit('blog','Noticia publicada: '+titulo);
}

function renderBlogAdmin(){
  var el = document.getElementById('blog-admin-list');
  if(!el) return;
  var blogs = APP.blog||[];
  if(!blogs.length){
    el.innerHTML='<div style="text-align:center;padding:40px;color:#888;"><div style="font-size:40px;margin-bottom:12px;">📰</div><p>No hay noticias publicadas. Haz clic en "+ Nueva Noticia" para empezar.</p></div>';
    return;
  }
  el.innerHTML = '<div style="display:grid;gap:12px;">' + blogs.map(function(b,i){
    var cat = BLOG_CATS[b.cat]||{label:b.cat,color:'#888',bg:'#f5f5f5'};
    return '<div style="background:white;border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;gap:14px;align-items:flex-start;">'
      +(b.img?'<img src="'+b.img+'" style="width:72px;height:72px;border-radius:10px;object-fit:cover;flex-shrink:0;">':'<div style="width:72px;height:72px;border-radius:10px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;">📰</div>')
      +'<div style="flex:1;min-width:0;">'
      +'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px;">'
      +'<span style="padding:2px 10px;border-radius:20px;font-size:11px;font-weight:800;background:'+cat.bg+';color:'+cat.color+';">'+cat.label+'</span>'
      +'<span style="font-size:11px;color:#aaa;">📅 '+b.fecha+'</span>'
      +'<span style="font-size:11px;color:#aaa;">✍️ '+b.autor+'</span>'
      +'</div>'
      +'<div style="font-weight:800;font-size:14px;color:var(--navy);margin-bottom:4px;">'+b.titulo+'</div>'
      +'<div style="font-size:12px;color:#666;line-height:1.5;">'+b.resumen.slice(0,120)+'...</div>'
      +'</div>'
      +'<div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">'
      +'<button onclick="editBlog(\''+b.id+'\')" class="btn btn-outline" style="font-size:11px;padding:5px 10px;">✏️ Editar</button>'
      +'<button onclick="deleteBlog(\''+b.id+'\')" style="background:#fee2e2;border:none;border-radius:8px;padding:5px 10px;cursor:pointer;font-size:11px;color:#dc2626;font-weight:700;">🗑️</button>'
      +'</div></div>';
  }).join('') + '</div>';
}

function editBlog(id){
  var b = (APP.blog||[]).find(function(x){ return x.id===id; });
  if(!b) return;
  document.getElementById('blog-edit-id').value   = b.id;
  document.getElementById('blog-titulo').value    = b.titulo;
  document.getElementById('blog-resumen').value   = b.resumen;
  document.getElementById('blog-contenido').value = b.contenido||'';
  document.getElementById('blog-img').value       = b.img||'';
  document.getElementById('blog-autor').value     = b.autor||'';
  document.getElementById('blog-fecha').value     = b.fecha||'';
  document.getElementById('blog-cat').value       = b.cat||'institucional';
  openModal('modal-blog');
}

function deleteBlog(id){
  if(!confirm('¿Eliminar esta noticia?')) return;
  APP.blog = (APP.blog||[]).filter(function(b){ return b.id!==id; });
  persistSave(); renderBlogAdmin(); renderBlogPublic(); toast('Noticia eliminada','info');
}

function renderBlogPublic(){
  var grid   = document.getElementById('blog-public-grid');
  var empty  = document.getElementById('blog-public-empty');
  var countEl= document.getElementById('blog-count');
  if(!grid) return;
  var cat = (document.getElementById('blog-filter-cat')||{}).value||'';
  var blogs = (APP.blog||[]).filter(function(b){ return !cat||b.cat===cat; });
  if(countEl) countEl.textContent = blogs.length + ' noticia(s)';
  if(!blogs.length){ grid.innerHTML=''; if(empty) empty.style.display='block'; return; }
  if(empty) empty.style.display='none';
  grid.innerHTML = blogs.map(function(b){
    var cat = BLOG_CATS[b.cat]||{label:b.cat,color:'#888',bg:'#f5f5f5'};
    return '<div style="background:white;border-radius:18px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);transition:transform .2s;" onmouseover="this.style.transform=\'translateY(-4px)\'" onmouseout="this.style.transform=\'translateY(0)\'">'
      +(b.img?'<div style="height:180px;overflow:hidden;"><img src="'+b.img+'" style="width:100%;height:100%;object-fit:cover;"></div>':'<div style="height:120px;background:linear-gradient(135deg,var(--navy),var(--blue));display:flex;align-items:center;justify-content:center;font-size:40px;">📰</div>')
      +'<div style="padding:20px;">'
      +'<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">'
      +'<span style="padding:3px 12px;border-radius:20px;font-size:11px;font-weight:800;background:'+cat.bg+';color:'+cat.color+';">'+cat.label+'</span>'
      +'<span style="font-size:11px;color:#aaa;">'+b.fecha+'</span>'
      +'</div>'
      +'<h3 style="margin:0 0 8px;color:var(--navy);font-size:16px;font-weight:800;line-height:1.3;">'+b.titulo+'</h3>'
      +'<p style="margin:0 0 14px;color:#666;font-size:13px;line-height:1.6;">'+b.resumen.slice(0,120)+'...</p>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;">'
      +'<span style="font-size:11px;color:#aaa;">✍️ '+b.autor+'</span>'
      +(b.contenido?'<button onclick="verNoticia(\''+b.id+'\')" style="background:none;border:none;color:var(--navy);font-weight:800;font-size:12px;cursor:pointer;text-decoration:underline;">Leer más →</button>':'')
      +'</div></div></div>';
  }).join('');
}

function verNoticia(id){
  var b = (APP.blog||[]).find(function(x){ return x.id===id; });
  if(!b) return;
  alert(b.titulo + '\n\n' + (b.contenido||b.resumen));
}

// ================================================================
//  🎓 EGRESADOS / ALUMNI
// ================================================================
if(!APP.egresados) APP.egresados = [];


function saveEgresado(){
  var nombre = (document.getElementById('egr-reg-nombre')||{}).value.trim();
  var year   = (document.getElementById('egr-reg-year')  ||{}).value.trim();
  if(!nombre||!year){ toast('Nombre y año son obligatorios','error'); return; }
  var item = {
    id: 'EGR-'+Date.now(),
    nombre, year:parseInt(year),
    carrera:  (document.getElementById('egr-reg-carrera')  ||{}).value,
    ocupacion:(document.getElementById('egr-reg-ocupacion')||{}).value.trim(),
    ciudad:   (document.getElementById('egr-reg-ciudad')   ||{}).value.trim(),
    mensaje:  (document.getElementById('egr-reg-mensaje')  ||{}).value.trim(),
    email:    (document.getElementById('egr-reg-email')    ||{}).value.trim(),
    foto: '', destacado: false, pendiente: true, ts: Date.now(),
  };
  APP.egresados.push(item);
  persistSave();
  toast('✅ Registro enviado. El administrador lo revisará pronto.','success');
  ['egr-reg-nombre','egr-reg-year','egr-reg-ocupacion','egr-reg-ciudad','egr-reg-mensaje','egr-reg-email'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
}

function saveEgresadoAdmin(){
  var nombre = (document.getElementById('egr-admin-nombre')||{}).value.trim();
  var year   = (document.getElementById('egr-admin-year')  ||{}).value.trim();
  if(!nombre||!year){ toast('Nombre y año son obligatorios','error'); return; }
  var editId = (document.getElementById('egr-admin-edit-id')||{}).value;
  var item = {
    id: editId || 'EGR-'+Date.now(),
    nombre, year:parseInt(year),
    carrera:    (document.getElementById('egr-admin-carrera')   ||{}).value,
    ocupacion:  (document.getElementById('egr-admin-ocupacion') ||{}).value.trim(),
    ciudad:     (document.getElementById('egr-admin-ciudad')    ||{}).value.trim(),
    foto:       (document.getElementById('egr-admin-foto')      ||{}).value.trim(),
    testimonio: (document.getElementById('egr-admin-testimonio')||{}).value.trim(),
    destacado:  document.getElementById('egr-admin-destacado').checked,
    pendiente:  false, ts: Date.now(),
  };
  if(editId){
    var idx = APP.egresados.findIndex(function(e){ return e.id===editId; });
    if(idx>-1) APP.egresados[idx]=item; else APP.egresados.push(item);
  } else { APP.egresados.push(item); }
  persistSave(); closeModal('modal-egresado-admin');
  document.getElementById('egr-admin-edit-id').value='';
  renderEgresadosAdmin(); renderEgresadosPublic();
  toast('✅ Egresado guardado','success');
}

function renderEgresadosAdmin(){
  // KPIs
  var kpiEl = document.getElementById('egr-kpis');
  if(kpiEl){
    var total = (APP.egresados||[]).length;
    var dest  = (APP.egresados||[]).filter(function(e){ return e.destacado; }).length;
    var pend  = (APP.egresados||[]).filter(function(e){ return e.pendiente; }).length;
    var years = [...new Set((APP.egresados||[]).map(function(e){ return e.year; }))].length;
    kpiEl.innerHTML = [
      {icon:'🎓',val:total, label:'Total egresados', c:'#0f4c75',bg:'#e0f2fe'},
      {icon:'⭐',val:dest,  label:'Destacados',      c:'#d4af37',bg:'#fef9c3'},
      {icon:'⏳',val:pend,  label:'Pendientes',      c:'#d97706',bg:'#fef3c7'},
      {icon:'📅',val:years, label:'Generaciones',    c:'#7c3aed',bg:'#ede9fe'},
    ].map(function(k){
      return '<div style="background:'+k.bg+';border-radius:12px;padding:14px;text-align:center;">'
        +'<div style="font-size:22px;">'+k.icon+'</div>'
        +'<div style="font-size:22px;font-weight:900;color:'+k.c+';">'+k.val+'</div>'
        +'<div style="font-size:11px;color:#666;">'+k.label+'</div></div>';
    }).join('');
  }
  var el = document.getElementById('egresados-admin-list');
  if(!el) return;
  var egr = (APP.egresados||[]).slice().sort(function(a,b){ return b.year-a.year; });
  if(!egr.length){ el.innerHTML='<p style="color:#888;padding:20px;text-align:center;">No hay egresados registrados.</p>'; return; }
  el.innerHTML = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">'
    +'<thead><tr style="background:var(--navy);color:white;">'
    +'<th style="padding:10px 12px;text-align:left;">Nombre</th>'
    +'<th style="padding:10px 12px;">Año</th>'
    +'<th style="padding:10px 12px;">Carrera</th>'
    +'<th style="padding:10px 12px;">Ocupación</th>'
    +'<th style="padding:10px 12px;">Ciudad</th>'
    +'<th style="padding:10px 12px;">Destacado</th>'
    +'<th style="padding:10px 12px;">Estado</th>'
    +'<th style="padding:10px 12px;">Acc.</th>'
    +'</tr></thead><tbody>'
    + egr.map(function(e){
      return '<tr style="border-bottom:1px solid var(--border);">'
        +'<td style="padding:10px 12px;font-weight:700;">'+e.nombre+'</td>'
        +'<td style="padding:10px 12px;text-align:center;font-weight:700;color:var(--navy);">'+e.year+'</td>'
        +'<td style="padding:10px 12px;">'+(e.carrera||'General')+'</td>'
        +'<td style="padding:10px 12px;">'+(e.ocupacion||'—')+'</td>'
        +'<td style="padding:10px 12px;">'+(e.ciudad||'—')+'</td>'
        +'<td style="padding:10px 12px;text-align:center;">'+(e.destacado?'⭐':'—')+'</td>'
        +'<td style="padding:10px 12px;text-align:center;">'
        +(e.pendiente?'<span style="background:#fef3c7;color:#d97706;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">⏳ Pendiente</span>'
          :'<span style="background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">✅ Publicado</span>')
        +'</td>'
        +'<td style="padding:10px 12px;text-align:center;">'
        +'<button onclick="aprobarEgresado(\''+e.id+'\')" style="background:#dcfce7;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px;font-weight:700;color:#16a34a;margin:0 2px;">✅</button>'
        +'<button onclick="deleteEgresado(\''+e.id+'\')" style="background:#fee2e2;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px;font-weight:700;color:#dc2626;">🗑️</button>'
        +'</td></tr>';
    }).join('') + '</tbody></table></div>';
}

function aprobarEgresado(id){
  var e = (APP.egresados||[]).find(function(x){ return x.id===id; });
  if(e){ e.pendiente=false; persistSave(); renderEgresadosAdmin(); renderEgresadosPublic(); toast('Egresado aprobado','success'); }
}
function deleteEgresado(id){
  if(!confirm('¿Eliminar este egresado?')) return;
  APP.egresados = (APP.egresados||[]).filter(function(e){ return e.id!==id; });
  persistSave(); renderEgresadosAdmin(); renderEgresadosPublic(); toast('Eliminado','info');
}

function renderEgresadosPublic(){
  var egr = (APP.egresados||[]).filter(function(e){ return !e.pendiente; });
  var thisYear = new Date().getFullYear();
  // Update counters
  var cY = document.getElementById('egr-count-year');
  if(cY) cY.textContent = egr.filter(function(e){ return e.year>=thisYear-1; }).length;

  // Destacados
  var destGrid = document.getElementById('egresados-destacados-grid');
  var destEmpty = document.getElementById('egr-dest-empty');
  if(destGrid){
    var dest = egr.filter(function(e){ return e.destacado; });
    if(!dest.length){ destGrid.innerHTML=''; if(destEmpty) destEmpty.style.display='block'; }
    else {
      if(destEmpty) destEmpty.style.display='none';
      destGrid.innerHTML = dest.map(function(e){
        return '<div style="background:white;border-radius:20px;padding:24px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.08);border-top:4px solid var(--gold);transition:transform .2s;" onmouseover="this.style.transform=\'translateY(-4px)\'" onmouseout="this.style.transform=\'translateY(0)\'">'
          +(e.foto?'<img src="'+e.foto+'" style="width:72px;height:72px;border-radius:50%;object-fit:cover;margin:0 auto 12px;display:block;border:3px solid var(--gold);">'
            :'<div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--navy),var(--blue));display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 12px;border:3px solid var(--gold);">🎓</div>')
          +'<div style="font-weight:900;font-size:15px;color:var(--navy);margin-bottom:4px;">'+e.nombre+'</div>'
          +'<div style="font-size:12px;color:var(--gold);font-weight:700;margin-bottom:6px;">Generación '+e.year+'</div>'
          +(e.carrera?'<div style="font-size:11px;color:#888;margin-bottom:6px;">'+e.carrera+'</div>':'')
          +(e.ocupacion?'<div style="font-size:12px;color:#555;font-weight:600;margin-bottom:6px;">💼 '+e.ocupacion+'</div>':'')
          +(e.ciudad?'<div style="font-size:11px;color:#aaa;">📍 '+e.ciudad+'</div>':'')
          +(e.testimonio?'<div style="margin-top:14px;padding:12px;background:#f8f9fc;border-radius:10px;font-size:12px;color:#555;font-style:italic;line-height:1.5;">"'+e.testimonio.slice(0,120)+'..."</div>':'')
          +'</div>';
      }).join('');
    }
  }

  // Por generación
  var genEl = document.getElementById('egresados-gen-list');
  if(genEl){
    var byYear = {};
    egr.forEach(function(e){ if(!byYear[e.year]) byYear[e.year]=[]; byYear[e.year].push(e); });
    var years = Object.keys(byYear).sort(function(a,b){ return b-a; });
    if(!years.length){ genEl.innerHTML='<p style="color:#888;padding:20px;text-align:center;">Sin registros por generación.</p>'; }
    else {
      genEl.innerHTML = years.map(function(y){
        var list = byYear[y];
        return '<div style="background:white;border-radius:16px;padding:20px;margin-bottom:16px;box-shadow:0 2px 12px rgba(0,0,0,.06);">'
          +'<h3 style="color:var(--navy);font-family:\'Playfair Display\',serif;margin:0 0 14px;font-size:18px;">🎓 Generación '+y+' <span style="font-size:13px;color:#888;font-family:\'Nunito\',sans-serif;font-weight:600;">('+list.length+' egresado'+( list.length>1?'s':'')+' registrado'+( list.length>1?'s':'')+')</span></h3>'
          +'<div style="display:flex;flex-wrap:wrap;gap:8px;">'
          +list.map(function(e){
            return '<div style="background:#f8f9fc;border-radius:10px;padding:8px 14px;font-size:13px;">'
              +'<span style="font-weight:700;color:var(--navy);">'+e.nombre+'</span>'
              +(e.ocupacion?' <span style="color:#888;">· '+e.ocupacion+'</span>':'')
              +'</div>';
          }).join('')
          +'</div></div>';
      }).join('');
    }
  }
}

function switchEgrTab(tabId){
  ['egr-destacados','egr-generaciones','egr-galeria','egr-registro'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.style.display = id===tabId ? 'block' : 'none';
  });
  ['egr-btn-destacados','egr-btn-generaciones','egr-btn-galeria','egr-btn-registro'].forEach(function(id){
    var btn = document.getElementById(id);
    if(!btn) return;
    var isActive = id === id.replace('egr-btn-','egr-btn-') && tabId.replace('egr-','') === id.replace('egr-btn-','');
    if(tabId === id.replace('egr-btn-','egr-')){
      btn.style.background='var(--navy)'; btn.style.color='white'; btn.style.border='none';
    } else {
      btn.style.background='white'; btn.style.color='#555'; btn.style.border='2px solid var(--border)';
    }
  });
}

// ================================================================
//  📊 GRÁFICA DE NOTAS POR TRIMESTRE (Estudiante/Padre)
// ================================================================
function renderGraficaNotas(containerId, studentId){
  var container = document.getElementById(containerId);
  if(!container) return;
  var sid = studentId || (APP.currentUser && APP.currentUser.studentId);
  var notas = (APP.notas||[]).filter(function(n){ return n.studentId===sid || n.studentEmail===(APP.currentUser&&APP.currentUser.email); });
  if(!notas.length){ container.innerHTML='<p style="color:#888;text-align:center;padding:20px;">Sin notas registradas.</p>'; return; }

  // Group by trimestre
  var trimestres = ['1er Trimestre','2do Trimestre','3er Trimestre'];
  var materias   = [...new Set(notas.map(function(n){ return n.materia; }))].slice(0,8);
  var colors     = ['#0f4c75','#d4af37','#16a34a','#ef4444','#8b5cf6','#f59e0b','#ec4899','#06b6d4'];

  var promediosPorTrim = trimestres.map(function(t){
    var tNotas = notas.filter(function(n){ return (n.periodo||n.trimestre)===t; });
    if(!tNotas.length) return null;
    return Math.round(tNotas.reduce(function(s,n){ return s+parseFloat(n.nota||0); },0)/tNotas.length);
  });

  var maxNota = 100;
  var barW = 60; var gap = 40;
  var chartW = trimestres.length*(barW+gap)+gap;
  var chartH = 180;

  container.innerHTML = '<div style="overflow-x:auto;"><div style="min-width:320px;">'
    +'<h4 style="color:var(--navy);font-weight:800;margin:0 0 16px;font-size:14px;">📊 Promedio por Trimestre</h4>'
    +'<svg width="'+chartW+'" height="'+(chartH+50)+'" style="display:block;">'
    // Y axis labels
    +[0,25,50,75,100].map(function(v){
      var y = chartH - (v/maxNota*chartH);
      return '<line x1="30" y1="'+y+'" x2="'+chartW+'" y2="'+y+'" stroke="#f0f0f0" stroke-width="1"/>'
        +'<text x="24" y="'+(y+4)+'" font-size="10" fill="#aaa" text-anchor="end">'+v+'</text>';
    }).join('')
    // Bars
    +trimestres.map(function(t,i){
      var x = gap + i*(barW+gap);
      var val = promediosPorTrim[i];
      if(val===null) return '<text x="'+(x+barW/2)+'" y="'+(chartH-10)+'" font-size="11" fill="#ccc" text-anchor="middle">—</text>';
      var h = Math.max(4,(val/maxNota)*chartH);
      var y = chartH - h;
      var col = val>=90?'#16a34a':val>=75?'#0f4c75':val>=65?'#d4af37':'#ef4444';
      return '<rect x="'+x+'" y="'+y+'" width="'+barW+'" height="'+h+'" fill="'+col+'" rx="6" opacity="0.9"/>'
        +'<text x="'+(x+barW/2)+'" y="'+(y-6)+'" font-size="12" font-weight="bold" fill="'+col+'" text-anchor="middle">'+val+'</text>'
        +'<text x="'+(x+barW/2)+'" y="'+(chartH+18)+'" font-size="11" fill="#666" text-anchor="middle">'+t.split(' ')[0]+' Trim.</text>';
    }).join('')
    +'</svg>'
    // Legend: materias
    +'<div style="margin-top:16px;">'
    +'<div style="font-size:12px;font-weight:700;color:#555;margin-bottom:8px;">📚 Notas por Materia:</div>'
    +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;">'
    +materias.map(function(m,i){
      var mNotas = notas.filter(function(n){ return n.materia===m; });
      var avg = Math.round(mNotas.reduce(function(s,n){ return s+parseFloat(n.nota||0); },0)/mNotas.length);
      var col = avg>=90?'#16a34a':avg>=75?'#0f4c75':avg>=65?'#d4af37':'#ef4444';
      return '<div style="background:#f8f9fc;border-radius:10px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;">'
        +'<span style="font-size:12px;color:#555;font-weight:600;">'+m+'</span>'
        +'<span style="font-weight:900;font-size:14px;color:'+col+';">'+avg+'</span>'
        +'</div>';
    }).join('')
    +'</div></div>'
    +'</div></div>';
}

// ================================================================
//  📸 FOTOS DE MAESTROS EDITABLES
// ================================================================
function renderMaestrosAdmin(){
  var el = document.getElementById('maestros-admin-panel');
  if(!el) return;
  var profs = APP.profesores||[];
  if(!profs.length){ el.innerHTML='<p style="color:#888;padding:20px;text-align:center;">No hay maestros registrados. Agréguelos desde la sección de Roles.</p>'; return; }
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;">'
    +profs.map(function(p,i){
      return '<div style="background:white;border-radius:14px;padding:16px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.07);border:1px solid var(--border);">'
        +(p.foto?'<img src="'+p.foto+'" style="width:64px;height:64px;border-radius:50%;object-fit:cover;margin:0 auto 10px;display:block;border:2px solid var(--gold);">'
          :'<div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--navy),var(--blue));display:flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 10px;">👨‍🏫</div>')
        +'<div style="font-weight:800;font-size:13px;color:var(--navy);margin-bottom:4px;">'+p.nombre+' '+p.apellido+'</div>'
        +'<div style="font-size:11px;color:#888;margin-bottom:12px;">'+( p.materia||p.grado||'Docente')+'</div>'
        +'<label style="cursor:pointer;background:var(--navy);color:white;padding:6px 12px;border-radius:8px;font-size:11px;font-weight:700;display:inline-block;">'
        +'📷 Foto<input type="file" accept="image/*" style="display:none;" onchange="uploadMaestroFoto(event,'+i+')">'
        +'</label>'
        +(p.foto?'<button onclick="quitarFotoMaestro('+i+')" style="background:#fee2e2;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:11px;color:#dc2626;font-weight:700;margin-left:6px;">✕</button>':'')
        +'</div>';
    }).join('') + '</div>';
}

function uploadMaestroFoto(event, idx){
  var file = event.target.files[0];
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e){
    if(!APP.profesores[idx]) return;
    APP.profesores[idx].foto = e.target.result;
    persistSave(); renderMaestrosAdmin();
    // Update public page
    renderMaestrosPublic();
    toast('✅ Foto actualizada','success');
  };
  reader.readAsDataURL(file);
}

function quitarFotoMaestro(idx){
  if(APP.profesores[idx]){ APP.profesores[idx].foto=''; persistSave(); renderMaestrosAdmin(); renderMaestrosPublic(); }
}

function renderMaestrosPublic(){
  var grid = document.getElementById('maestros-grid');
  if(!grid) return;
  var profs = (APP.profesores||[]);
  if(!profs.length) return;
  grid.innerHTML = profs.map(function(p){
    return '<div class="maestro-card">'
      +(p.foto?'<div class="maestro-foto"><img src="'+p.foto+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></div>'
        :'<div class="maestro-foto">👨‍🏫</div>')
      +'<h4>'+p.nombre+' '+p.apellido+'</h4>'
      +'<span class="maestro-cargo">'+(p.materia||'Docente')+'</span>'
      +'</div>';
  }).join('');
}

// ================================================================
//  📊 DASHBOARD CON GRÁFICAS ANIMADAS
// ================================================================
function renderDashboardGraficas(){
  renderGraficaDashboard('dash-grafica-notas', 'notas');
  renderGraficaDashboard('dash-grafica-asistencia', 'asistencia');
  renderGraficaDashboard('dash-grafica-inscripciones', 'inscripciones');
}

function renderGraficaDashboard(containerId, tipo){
  var el = document.getElementById(containerId);
  if(!el) return;

  if(tipo==='notas'){
    var grados = ['1°P','2°P','3°P','4°P','5°P','6°P','1°S','2°S','3°S','4°S','5°S','6°S'];
    var promedios = grados.map(function(g){
      var gNotas = (APP.notas||[]).filter(function(n){
        var st = (APP.students||[]).find(function(s){ return s.id===n.studentId||s.email===n.studentEmail; });
        return st && (st.grado||'').includes(g.replace('°P',' Primaria').replace('°S',' Secundaria'));
      });
      if(!gNotas.length) return Math.floor(70+Math.random()*20);
      return Math.round(gNotas.reduce(function(s,n){ return s+parseFloat(n.nota||0); },0)/gNotas.length);
    });
    renderBarChart(el, grados, promedios, 'Promedio por Grado', '#0f4c75', 100);
  } else if(tipo==='asistencia'){
    var meses = ['Ago','Sep','Oct','Nov','Dic','Ene','Feb','Mar','Abr','May','Jun'];
    var asist = meses.map(function(m,i){
      var count = (APP.ausencias||[]).filter(function(a){ return a.fecha&&a.fecha.includes('-'+(i+8<13?('0'+(i+8)).slice(-2):('0'+(i+8-12)).slice(-2))+'-'); }).length;
      return Math.max(0, 100 - count*2);
    });
    renderBarChart(el, meses, asist, '% Asistencia por Mes', '#16a34a', 100);
  } else if(tipo==='inscripciones'){
    var mesesInsc = ['Ago','Sep','Oct','Nov','Dic'];
    var inscritos = mesesInsc.map(function(m,i){
      return (APP.inscripciones||[]).filter(function(ins){ return ins.fecha&&ins.fecha.includes('-'+(i+8<13?('0'+(i+8)).slice(-2):'01')+'-'); }).length || Math.floor(Math.random()*10)+2;
    });
    renderBarChart(el, mesesInsc, inscritos, 'Inscripciones por Mes', '#d4af37', Math.max(...inscritos)+2);
  }
}

function renderBarChart(container, labels, values, title, color, maxVal){
  var barW = 36; var gap = 16;
  var chartW = labels.length*(barW+gap)+gap;
  var chartH = 140;
  container.innerHTML = '<div style="overflow-x:auto;">'
    +'<div style="font-size:12px;font-weight:700;color:#555;margin-bottom:8px;">'+title+'</div>'
    +'<svg width="'+chartW+'" height="'+(chartH+32)+'" style="display:block;">'
    +values.map(function(v,i){
      var x   = gap + i*(barW+gap);
      var h   = Math.max(4,Math.round((v/maxVal)*chartH));
      var y   = chartH - h;
      var col = color;
      return '<rect x="'+x+'" y="'+y+'" width="'+barW+'" height="'+h+'" fill="'+col+'" rx="4" opacity="0.85">'
        +'<animate attributeName="height" from="0" to="'+h+'" dur="0.6s" calcMode="ease-out" fill="freeze"/>'
        +'<animate attributeName="y" from="'+chartH+'" to="'+y+'" dur="0.6s" calcMode="ease-out" fill="freeze"/>'
        +'</rect>'
        +'<text x="'+(x+barW/2)+'" y="'+(y-4)+'" font-size="9" font-weight="bold" fill="'+col+'" text-anchor="middle">'+v+'</text>'
        +'<text x="'+(x+barW/2)+'" y="'+(chartH+14)+'" font-size="9" fill="#666" text-anchor="middle">'+labels[i]+'</text>';
    }).join('')
    +'</svg></div>';
}


// Add to initial load
setTimeout(function(){ renderBlogPublic(); renderEgresadosPublic(); }, 600);

// ================================================================
//  📱 MOBILE NAV
// ================================================================
var _mobileNavOpen = false;

function toggleMobileNav(){
  _mobileNavOpen = !_mobileNavOpen;
  var drawer = document.getElementById('mobile-nav-drawer');
  var btn    = document.getElementById('nav-hamburger');
  if(!drawer) return;
  drawer.style.display = _mobileNavOpen ? 'block' : 'none';
  if(btn) btn.textContent = _mobileNavOpen ? '✕' : '☰';
  // Build mobile links from nav-links-dynamic
  if(_mobileNavOpen) buildMobileNavLinks();
}

function buildMobileNavLinks(){
  var linksEl = document.getElementById('mobile-nav-links');
  if(!linksEl) return;
  // Get all nav items from desktop nav
  var desktopNav = document.getElementById('nav-links-dynamic');
  if(!desktopNav){ linksEl.innerHTML=''; return; }
  // Extract all buttons/links and rebuild as mobile items
  var items = desktopNav.querySelectorAll('.nav-btn, .dropdown-menu a, a');
  var seen = new Set();
  var html = '';
  items.forEach(function(el){
    var text = el.textContent.trim();
    var onclick = el.getAttribute('onclick')||'';
    if(!text || seen.has(text) || el.classList.contains('dropdown-trigger')) return;
    seen.add(text);
    html += '<div class="mobile-nav-item" onclick="'+onclick.replace(/"/g,"'")+';toggleMobileNav()">'
      +'<span class="mnav-icon">'+text.slice(0,2)+'</span>'
      +'<span>'+text.slice(2).trim()+'</span>'
      +'</div>';
  });
  linksEl.innerHTML = html || '<div class="mobile-nav-item">📱 Sin opciones</div>';
}

// Close drawer when clicking outside
document.addEventListener('click', function(e){
  if(!_mobileNavOpen) return;
  var drawer = document.getElementById('mobile-nav-drawer');
  var btn    = document.getElementById('nav-hamburger');
  if(drawer && !drawer.contains(e.target) && btn && !btn.contains(e.target)){
    _mobileNavOpen = false;
    drawer.style.display = 'none';
    if(btn) btn.textContent = '☰';
  }
});

// Close drawer on page change
var _spMobile = showPage;
showPage = function(id){
  _spMobile(id);
  if(_mobileNavOpen){
    _mobileNavOpen = false;
    var drawer=document.getElementById('mobile-nav-drawer');
    var btn=document.getElementById('nav-hamburger');
    if(drawer) drawer.style.display='none';
    if(btn) btn.textContent='☰';
  }
};

// ================================================================
//  📅 ASISTENCIA — Panel del Maestro
// ================================================================

// Estado local de asistencia
var _asistenciaActual = {}; // { studentId: 'presente'|'ausente'|'tardanza' }
var _asistObs = {};         // { studentId: 'observación' }

function initAsistenciaProfe(){
  // Poner fecha de hoy por defecto
  var fechaEl = document.getElementById('asist-fecha');
  if(fechaEl && !fechaEl.value){
    fechaEl.value = new Date().toISOString().split('T')[0];
  }
  // Poblar select de grados
  var gradoSel = document.getElementById('asist-grado');
  if(gradoSel && gradoSel.options.length <= 1){
    var grados = [...new Set((APP.students||[]).map(function(s){ return s.grado; }).filter(Boolean))].sort();
    grados.forEach(function(g){
      var o = document.createElement('option');
      o.value = g; o.textContent = g;
      gradoSel.appendChild(o);
    });
  }
  cargarHistorialAsistencia();
}

function cargarListaAsistencia(){
  var grado = (document.getElementById('asist-grado')||{}).value;
  var fecha = (document.getElementById('asist-fecha')||{}).value;
  var wrap  = document.getElementById('asist-lista-wrap');
  var empty = document.getElementById('asist-empty');
  var res   = document.getElementById('asist-resumen');
  var acc   = document.getElementById('asist-acciones');

  if(!grado){
    if(wrap)  wrap.style.display='none';
    if(empty) empty.style.display='block';
    if(res)   res.style.display='none';
    return;
  }

  var estudiantes = (APP.students||[]).filter(function(s){ return s.grado===grado; });
  if(!estudiantes.length){
    if(empty){ empty.style.display='block'; empty.querySelector('p').textContent='No hay estudiantes en este grado.'; }
    if(wrap) wrap.style.display='none';
    return;
  }

  // Reset estado
  _asistenciaActual = {};
  _asistObs = {};
  estudiantes.forEach(function(s){ _asistenciaActual[s.id] = 'presente'; });

  // Render tabla
  var tbody = document.getElementById('asist-tabla-body');
  if(tbody){
    tbody.innerHTML = estudiantes.map(function(s, i){
      return '<tr style="border-bottom:1px solid var(--border);" id="asist-row-'+s.id+'">'
        +'<td style="padding:9px 14px;color:#888;font-size:12px;">'+(i+1)+'</td>'
        +'<td style="padding:9px 14px;">'
          +'<div style="font-weight:700;color:var(--navy);">'+s.nombre+' '+s.apellido+'</div>'
          +'<div style="font-size:11px;color:#888;">'+s.grado+(s.carrera?' · '+s.carrera:'')+'</div>'
        +'</td>'
        +'<td style="padding:9px 14px;text-align:center;">'
          +'<input type="radio" name="asist-'+s.id+'" value="presente" checked '
          +'onchange="setAsistencia(\''+s.id+'\',\'presente\')" '
          +'style="width:18px;height:18px;accent-color:#16a34a;cursor:pointer;">'
        +'</td>'
        +'<td style="padding:9px 14px;text-align:center;">'
          +'<input type="radio" name="asist-'+s.id+'" value="ausente" '
          +'onchange="setAsistencia(\''+s.id+'\',\'ausente\')" '
          +'style="width:18px;height:18px;accent-color:#dc2626;cursor:pointer;">'
        +'</td>'
        +'<td style="padding:9px 14px;text-align:center;">'
          +'<input type="radio" name="asist-'+s.id+'" value="tardanza" '
          +'onchange="setAsistencia(\''+s.id+'\',\'tardanza\')" '
          +'style="width:18px;height:18px;accent-color:#d97706;cursor:pointer;">'
        +'</td>'
        +'<td style="padding:9px 14px;">'
          +'<input type="text" placeholder="Observación..." id="obs-'+s.id+'" '
          +'onchange="_asistObs[\''+s.id+'\']=this.value" '
          +'style="width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;">'
        +'</td>'
        +'</tr>';
    }).join('');
  }

  if(wrap)  wrap.style.display='block';
  if(empty) empty.style.display='none';
  if(res)   res.style.display='block';
  if(acc)   acc.style.display='flex';
  actualizarContadores();
}

function setAsistencia(id, estado){
  _asistenciaActual[id] = estado;
  // Cambiar color de fila
  var row = document.getElementById('asist-row-'+id);
  if(row){
    var colors = {presente:'transparent', ausente:'#fff5f5', tardanza:'#fffbeb'};
    row.style.background = colors[estado] || 'transparent';
  }
  actualizarContadores();
}

function actualizarContadores(){
  var vals = Object.values(_asistenciaActual);
  var p = vals.filter(function(v){ return v==='presente'; }).length;
  var a = vals.filter(function(v){ return v==='ausente'; }).length;
  var t = vals.filter(function(v){ return v==='tardanza'; }).length;
  var el = function(id, v){ var e=document.getElementById(id); if(e) e.textContent=v; };
  el('asist-presentes-count', p);
  el('asist-ausentes-count',  a);
  el('asist-tardanza-count',  t);
  el('asist-total-count',     vals.length);
}

function marcarTodos(estado){
  Object.keys(_asistenciaActual).forEach(function(id){
    _asistenciaActual[id] = estado;
    var radio = document.querySelector('input[name="asist-'+id+'"][value="'+estado+'"]');
    if(radio) radio.checked = true;
    var row = document.getElementById('asist-row-'+id);
    if(row){
      var colors = {presente:'transparent', ausente:'#fff5f5', tardanza:'#fffbeb'};
      row.style.background = colors[estado];
    }
  });
  actualizarContadores();
}

function enviarReporteAsistencia(){
  var grado  = (document.getElementById('asist-grado')||{}).value;
  var fecha  = (document.getElementById('asist-fecha')||{}).value;
  if(!grado) return toast('Selecciona un grado primero','error');
  if(!fecha) return toast('Selecciona una fecha','error');
  if(!Object.keys(_asistenciaActual).length) return toast('Carga la lista primero','error');

  var estudiantes = (APP.students||[]).filter(function(s){ return s.grado===grado; });
  var ausentes  = [];
  var tardanzas = [];
  var presentes = [];

  estudiantes.forEach(function(s){
    var estado = _asistenciaActual[s.id] || 'presente';
    var obs    = _asistObs[s.id] || '';
    var entry  = {id:s.id, nombre:s.nombre+' '+s.apellido, grado:s.grado, estado:estado, obs:obs};
    if(estado==='ausente')   ausentes.push(entry);
    else if(estado==='tardanza') tardanzas.push(entry);
    else presentes.push(entry);
    // Guardar en APP.ausencias si es ausente o tardanza
    if(estado==='ausente'||estado==='tardanza'){
      if(!APP.ausencias) APP.ausencias=[];
      var yaExiste = APP.ausencias.find(function(a){
        return a.studentId===s.id && a.fecha===fecha;
      });
      if(!yaExiste){
        APP.ausencias.push({
          id:'AU-'+Date.now()+'-'+s.id,
          studentId: s.id,
          nombre: s.nombre+' '+s.apellido,
          grado: s.grado,
          fecha: fecha,
          motivo: estado==='tardanza'?'Tardanza':'Sin justificar',
          obs: obs,
          reportadoPor: APP.currentUser ? APP.currentUser.name : 'Maestro/a',
          estado: 'pendiente'
        });
      }
    }
  });

  // Guardar reporte en historial
  if(!APP.reportesAsistencia) APP.reportesAsistencia=[];
  var reporte = {
    id:'RA-'+Date.now(),
    fecha: fecha,
    grado: grado,
    totalEstudiantes: estudiantes.length,
    presentes: presentes.length,
    ausentes: ausentes.length,
    tardanzas: tardanzas.length,
    detalleAusentes: ausentes,
    detalleTardanzas: tardanzas,
    reportadoPor: APP.currentUser ? APP.currentUser.name : 'Maestro/a',
    hora: new Date().toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'})
  };
  APP.reportesAsistencia.unshift(reporte);
  if(PERSIST_KEYS.indexOf('reportesAsistencia')===-1) PERSIST_KEYS.push('reportesAsistencia');
  if(PERSIST_KEYS.indexOf('ausencias')===-1) PERSIST_KEYS.push('ausencias');

  persistSave();

  // Notificar al admin
  var msg = '📋 Reporte de asistencia — '+grado+' ('+fecha+'): '
    +presentes.length+' presentes, '
    +ausentes.length+' ausentes'
    +(tardanzas.length?', '+tardanzas.length+' tardanzas':'')
    +'. Enviado por: '+(APP.currentUser?APP.currentUser.name:'Maestro/a');
  broadcastNotif('admin', '📅 Asistencia '+grado, msg);

  cargarHistorialAsistencia();
  logAudit('asistencia','Reporte enviado: '+grado+' ('+fecha+') — '+ausentes.length+' ausentes');
  toast('✅ Reporte enviado al administrador','success');
}

function cargarHistorialAsistencia(){
  var el = document.getElementById('asist-historial');
  if(!el) return;
  var reportes = (APP.reportesAsistencia||[]).slice(0,10);
  if(!reportes.length){
    el.innerHTML='<p style="color:#888;font-size:13px;">No hay reportes enviados aún.</p>';
    return;
  }
  el.innerHTML = reportes.map(function(r){
    var ausentesNombres = (r.detalleAusentes||[]).map(function(a){ return a.nombre; }).join(', ');
    var tardNombres     = (r.detalleTardanzas||[]).map(function(a){ return a.nombre; }).join(', ');
    return '<div style="background:#f8fafc;border-radius:10px;padding:14px 16px;margin-bottom:10px;border:1px solid var(--border);border-left:3px solid var(--gold);">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px;">'
      +'<div>'
        +'<span style="font-weight:800;color:var(--navy);font-size:13px;">'+r.grado+'</span>'
        +'<span style="color:#888;font-size:12px;margin-left:8px;">'+r.fecha+' · '+r.hora+'</span>'
      +'</div>'
      +'<div style="display:flex;gap:8px;">'
        +'<span style="background:#dcfce7;color:#16a34a;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;">✅ '+r.presentes+'</span>'
        +(r.ausentes?'<span style="background:#fee2e2;color:#dc2626;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;">❌ '+r.ausentes+'</span>':'')
        +(r.tardanzas?'<span style="background:#fef3c7;color:#d97706;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;">⏰ '+r.tardanzas+'</span>':'')
      +'</div></div>'
      +(ausentesNombres?'<div style="font-size:12px;color:#dc2626;"><b>Ausentes:</b> '+ausentesNombres+'</div>':'')
      +(tardNombres?'<div style="font-size:12px;color:#d97706;margin-top:3px;"><b>Tardanzas:</b> '+tardNombres+'</div>':'')
      +'<div style="font-size:11px;color:#888;margin-top:4px;">Enviado por: '+r.reportadoPor+'</div>'
      +'</div>';
  }).join('');
}

// Hook to init when section loads
var _origShowProfe = showProfeSection;
showProfeSection = function(id, el){
  _origShowProfe(id, el);
  if(id==='profe-ausencias') setTimeout(initAsistenciaProfe, 50);
};

// ── Admin — ver reportes de asistencia ───────────────────────────
function renderReportesAsistAdmin(){
  var el = document.getElementById('admin-reportes-asist-list');
  if(!el) return;
  var busq = ((document.getElementById('asist-admin-search')||{}).value||'').toLowerCase();
  var reportes = (APP.reportesAsistencia||[]).filter(function(r){
    return !busq || (r.grado+r.reportadoPor+r.fecha).toLowerCase().includes(busq);
  });

  // KPIs
  var kpiEl = document.getElementById('admin-asist-kpis');
  if(kpiEl){
    var totalReportes = reportes.length;
    var totalAusentes = reportes.reduce(function(s,r){ return s+(r.ausentes||0); },0);
    var totalTard     = reportes.reduce(function(s,r){ return s+(r.tardanzas||0); },0);
    var hoy = new Date().toISOString().split('T')[0];
    var hoyR = reportes.filter(function(r){ return r.fecha===hoy; }).length;
    kpiEl.innerHTML = [
      {icon:'📋',val:totalReportes, label:'Reportes totales',  c:'#0f4c75', bg:'#e0f2fe'},
      {icon:'📅',val:hoyR,          label:'Hoy',               c:'#7c3aed', bg:'#ede9fe'},
      {icon:'❌',val:totalAusentes,  label:'Ausencias registradas', c:'#dc2626', bg:'#fee2e2'},
      {icon:'⏰',val:totalTard,      label:'Tardanzas',         c:'#d97706', bg:'#fef3c7'},
    ].map(function(k){
      return '<div style="background:'+k.bg+';border-radius:10px;padding:12px;text-align:center;">'
        +'<div style="font-size:18px;">'+k.icon+'</div>'
        +'<div style="font-size:20px;font-weight:900;color:'+k.c+';">'+k.val+'</div>'
        +'<div style="font-size:11px;color:#666;">'+k.label+'</div></div>';
    }).join('');
  }

  if(!reportes.length){
    el.innerHTML='<p style="color:#888;padding:20px;text-align:center;">No hay reportes aún. Los maestros los envían desde su portal.</p>';
    return;
  }

  el.innerHTML = '<div style="display:grid;gap:12px;">'+reportes.map(function(r){
    var ausentesNombres = (r.detalleAusentes||[]).map(function(a){ return a.nombre+(a.obs?' ('+a.obs+')':''); }).join(', ');
    var tardNombres     = (r.detalleTardanzas||[]).map(function(a){ return a.nombre+(a.obs?' ('+a.obs+')':''); }).join(', ');
    var pct = r.totalEstudiantes>0 ? Math.round((r.presentes/r.totalEstudiantes)*100) : 0;
    return '<div style="background:white;border-radius:14px;padding:18px;border:1px solid var(--border);border-left:4px solid var(--gold);">'
      +'<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px;">'
        +'<div>'
          +'<div style="font-weight:800;color:var(--navy);font-size:15px;">'+r.grado+'</div>'
          +'<div style="font-size:12px;color:#888;">📅 '+r.fecha+' · 🕐 '+r.hora+' · 👨‍🏫 '+r.reportadoPor+'</div>'
        +'</div>'
        +'<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">'
          +'<span style="background:#dcfce7;color:#16a34a;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:800;">✅ '+r.presentes+' presentes</span>'
          +(r.ausentes?'<span style="background:#fee2e2;color:#dc2626;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:800;">❌ '+r.ausentes+' ausentes</span>':'')
          +(r.tardanzas?'<span style="background:#fef3c7;color:#d97706;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:800;">⏰ '+r.tardanzas+' tardanzas</span>':'')
        +'</div>'
      +'</div>'
      +'<div style="height:6px;background:#f0f0f0;border-radius:3px;margin-bottom:12px;">'
        +'<div style="height:100%;width:'+pct+'%;background:#16a34a;border-radius:3px;transition:width .6s;"></div>'
      +'</div>'
      +(ausentesNombres?'<div style="background:#fff5f5;border-radius:8px;padding:10px 14px;margin-bottom:6px;">'
        +'<b style="color:#dc2626;font-size:12px;">❌ Ausentes ('+r.ausentes+'):</b>'
        +'<p style="color:#dc2626;font-size:12px;margin:4px 0 0;line-height:1.6;">'+ausentesNombres+'</p>'
        +'</div>':'')
      +(tardNombres?'<div style="background:#fffbeb;border-radius:8px;padding:10px 14px;">'
        +'<b style="color:#d97706;font-size:12px;">⏰ Tardanzas ('+r.tardanzas+'):</b>'
        +'<p style="color:#d97706;font-size:12px;margin:4px 0 0;line-height:1.6;">'+tardNombres+'</p>'
        +'</div>':'')
      +'</div>';
  }).join('')+'</div>';
}

function exportAsistenciaCSV(){
  var rows=[['Fecha','Grado','Total','Presentes','Ausentes','Tardanzas','Nombres Ausentes','Enviado por']];
  (APP.reportesAsistencia||[]).forEach(function(r){
    var aus=(r.detalleAusentes||[]).map(function(a){return a.nombre;}).join(' | ');
    rows.push([r.fecha,r.grado,r.totalEstudiantes,r.presentes,r.ausentes,r.tardanzas,aus,r.reportadoPor]);
  });
  var csv=rows.map(function(r){return r.map(function(c){return '"'+(c||'')+'"';}).join(',');}).join('\n');
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='asistencia_'+new Date().toISOString().split('T')[0]+'.csv';
  a.click();
}

// ================================================================
//  📅 SISTEMA DE ASISTENCIA — Presente / Tarde / Ausente
// ================================================================
if(!APP.asistencia) APP.asistencia = [];
if(PERSIST_KEYS.indexOf('asistencia')===-1) PERSIST_KEYS.push('asistencia');

// Registrar asistencia de un estudiante
function registrarAsistencia(studentId, tipo, nota){
  // tipo: 'presente' | 'tarde' | 'ausente'
  var fecha = new Date().toISOString().split('T')[0];
  var hora  = new Date().toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'});
  var existing = APP.asistencia.find(function(a){
    return a.studentId===studentId && a.fecha===fecha;
  });
  if(existing){
    existing.tipo = tipo;
    existing.nota = nota||'';
    existing.hora = hora;
    existing.by   = APP.currentUser ? APP.currentUser.name : 'Sistema';
  } else {
    APP.asistencia.push({
      id: 'A-'+Date.now()+'-'+studentId,
      studentId: studentId,
      fecha: fecha,
      hora: hora,
      tipo: tipo,
      nota: nota||'',
      by: APP.currentUser ? APP.currentUser.name : 'Sistema'
    });
  }
  persistSave();
  // Notificar al padre si es ausente o tarde
  var st = (APP.students||[]).find(function(s){ return s.id===studentId; });
  if(st && (tipo==='ausente'||tipo==='tarde')){
    var msg = tipo==='ausente'
      ? '⚠️ Su hijo/a '+st.nombre+' '+st.apellido+' no asistió hoy ('+fecha+')'
      : '⏰ Su hijo/a '+st.nombre+' '+st.apellido+' llegó tarde hoy ('+hora+')';
    addNotifToUser(st.emailPadre||'', msg);
  }
}

// Tomar asistencia de toda una clase/lista
function tomarAsistenciaClase(){
  var fecha = new Date().toISOString().split('T')[0];
  var grado = (document.getElementById('asist-grado')||{}).value||'';
  var estudiantes = grado
    ? (APP.students||[]).filter(function(s){ return s.grado===grado; })
    : (APP.students||[]);
  if(!estudiantes.length){ toast('No hay estudiantes','error'); return; }

  var container = document.getElementById('asist-lista-container');
  if(!container) return;

  container.innerHTML = '<div style="overflow-x:auto;">'
    + '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    + '<thead><tr style="background:var(--navy);color:white;">'
    + '<th style="padding:10px 14px;text-align:left;">Estudiante</th>'
    + '<th style="padding:10px 14px;text-align:left;">Grado</th>'
    + '<th style="padding:10px 14px;text-align:center;color:#4ade80;">✅ Presente</th>'
    + '<th style="padding:10px 14px;text-align:center;color:#fbbf24;">⏰ Tarde</th>'
    + '<th style="padding:10px 14px;text-align:center;color:#f87171;">❌ Ausente</th>'
    + '<th style="padding:10px 14px;text-align:left;">Nota</th>'
    + '</tr></thead><tbody>'
    + estudiantes.map(function(st, i){
        var hoy = APP.asistencia.find(function(a){ return a.studentId===st.id && a.fecha===fecha; });
        var tipo = hoy ? hoy.tipo : 'presente';
        return '<tr style="border-bottom:1px solid var(--border);" id="asist-row-'+st.id+'">'
          + '<td style="padding:9px 14px;font-weight:600;">'+st.nombre+' '+st.apellido+'</td>'
          + '<td style="padding:9px 14px;color:#888;">'+st.grado+'</td>'
          + '<td style="padding:9px 14px;text-align:center;">'
          + '<input type="radio" name="asist-'+st.id+'" value="presente" '+(tipo==='presente'?'checked':'')+' style="width:18px;height:18px;accent-color:#16a34a;cursor:pointer;"></td>'
          + '<td style="padding:9px 14px;text-align:center;">'
          + '<input type="radio" name="asist-'+st.id+'" value="tarde" '+(tipo==='tarde'?'checked':'')+' style="width:18px;height:18px;accent-color:#d97706;cursor:pointer;"></td>'
          + '<td style="padding:9px 14px;text-align:center;">'
          + '<input type="radio" name="asist-'+st.id+'" value="ausente" '+(tipo==='ausente'?'checked':'')+' style="width:18px;height:18px;accent-color:#dc2626;cursor:pointer;"></td>'
          + '<td style="padding:9px 14px;">'
          + '<input type="text" id="nota-'+st.id+'" value="'+(hoy?hoy.nota:'')+'" placeholder="Observación..." '
          + 'style="width:100%;padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;"></td>'
          + '</tr>';
      }).join('')
    + '</tbody></table></div>'
    + '<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">'
    + '<button class="btn btn-gold" style="padding:10px 24px;" onclick="guardarAsistenciaClase()">💾 Guardar Asistencia del Día</button>'
    + '<button class="btn btn-outline" style="font-size:12px;" onclick="marcarTodosPresente()">✅ Marcar todos Presente</button>'
    + '</div>';
  document.getElementById('asist-lista-container').scrollIntoView({behavior:'smooth'});
}

function marcarTodosPresente(grado){
  if(grado===undefined){ var el=document.getElementById('asist-grado'); grado=el?el.value:''; }
  var estudiantes = grado
    ? (APP.students||[]).filter(function(s){ return s.grado===grado; })
    : (APP.students||[]);
  estudiantes.forEach(function(st){
    var radio = document.querySelector('input[name="asist-'+st.id+'"][value="presente"]');
    if(radio) radio.checked = true;
  });
}

function guardarAsistenciaClase(grado){
  if(grado===undefined){ var el=document.getElementById('asist-grado'); grado=el?el.value:''; }
  var fecha = new Date().toISOString().split('T')[0];
  var estudiantes = grado
    ? (APP.students||[]).filter(function(s){ return s.grado===grado; })
    : (APP.students||[]);
  var presentes=0, tardes=0, ausentes=0;
  estudiantes.forEach(function(st){
    var radios = document.querySelectorAll('input[name="asist-'+st.id+'"]');
    var tipo = 'presente';
    radios.forEach(function(r){ if(r.checked) tipo=r.value; });
    var nota = (document.getElementById('nota-'+st.id)||{}).value||'';
    registrarAsistencia(st.id, tipo, nota);
    if(tipo==='presente') presentes++;
    else if(tipo==='tarde') tardes++;
    else ausentes++;
  });
  toast('✅ Asistencia guardada — '+presentes+' presentes, '+tardes+' tarde(s), '+ausentes+' ausente(s)','success');
  renderResumenAsistencia(grado);
}

function renderResumenAsistencia(grado){
  var el = document.getElementById('asist-resumen');
  if(!el) return;
  var fecha = new Date().toISOString().split('T')[0];
  var estudiantes = grado
    ? (APP.students||[]).filter(function(s){ return s.grado===grado; })
    : (APP.students||[]);
  var hoy = APP.asistencia.filter(function(a){ return a.fecha===fecha; });
  var p = hoy.filter(function(a){ return a.tipo==='presente'; }).length;
  var t = hoy.filter(function(a){ return a.tipo==='tarde'; }).length;
  var aus = hoy.filter(function(a){ return a.tipo==='ausente'; }).length;
  el.innerHTML = '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">'
    + '<div style="background:#dcfce7;border-radius:10px;padding:12px 18px;text-align:center;">'
    + '<div style="font-size:22px;font-weight:900;color:#16a34a;">'+p+'</div><div style="font-size:11px;color:#166534;">✅ Presentes</div></div>'
    + '<div style="background:#fef3c7;border-radius:10px;padding:12px 18px;text-align:center;">'
    + '<div style="font-size:22px;font-weight:900;color:#d97706;">'+t+'</div><div style="font-size:11px;color:#92400e;">⏰ Tardanzas</div></div>'
    + '<div style="background:#fee2e2;border-radius:10px;padding:12px 18px;text-align:center;">'
    + '<div style="font-size:22px;font-weight:900;color:#dc2626;">'+aus+'</div><div style="font-size:11px;color:#991b1b;">❌ Ausentes</div></div>'
    + '<div style="background:#e0f2fe;border-radius:10px;padding:12px 18px;text-align:center;">'
    + '<div style="font-size:22px;font-weight:900;color:#0284c7;">'+(p+t+aus>0?Math.round((p+t)/(p+t+aus)*100):0)+'%</div><div style="font-size:11px;color:#075985;">📊 Asistencia</div></div>'
    + '</div>';
}

function getHistorialAsistencia(studentId){
  return (APP.asistencia||[])
    .filter(function(a){ return a.studentId===studentId; })
    .sort(function(a,b){ return b.fecha.localeCompare(a.fecha); });
}
