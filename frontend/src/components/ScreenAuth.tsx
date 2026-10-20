import React, { useEffect, useState } from 'react';
import { api, login, API_ENABLED } from '../services/apiClient';
import { gismatStore } from '../services/gismatStore';

interface ScreenAuthProps {
  onLoginSuccess: () => void;
}

type AuthStage = 'login' | 'recover' | 'confirmation' | 'reset';

export const ScreenAuth: React.FC<ScreenAuthProps> = ({ onLoginSuccess }) => {
  // Enlace de recuperación enviado por correo: /?uid=...&token=...
  const resetParams = new URLSearchParams(window.location.search);
  const resetUid = resetParams.get('uid');
  const resetToken = resetParams.get('token');
  const [stage, setStage] = useState<AuthStage>(API_ENABLED && resetUid && resetToken ? 'reset' : 'login');
  const [username, setUsername] = useState(API_ENABLED ? '' : 'usuarioejemplo');
  const [password, setPassword] = useState(API_ENABLED ? '' : 'password123');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Logo interactive hover / touch state
  const [isLogoHovered, setIsLogoHovered] = useState(false);

  // Recovery & reset state
  const [recoverEmail, setRecoverEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showResetPass1, setShowResetPass1] = useState(false);
  const [showResetPass2, setShowResetPass2] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState(false);

  // Enlace de verificación de correo: /verificar-email?token=...
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    if (!API_ENABLED || !t || !window.location.pathname.includes('verificar-email')) return;
    api('/auth/verificar-email/', { body: { token: t }, auth: false })
      .then(() => window.alert('Correo verificado. Ya podés iniciar sesión.'))
      .catch((err) => window.alert((err as Error).message))
      .finally(() => window.history.replaceState({}, '', '/'));
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!API_ENABLED) {
      onLoginSuccess();
      return;
    }
    setLoginError('');
    setLoggingIn(true);
    try {
      await login(username.trim(), password, rememberMe);
      await gismatStore.hydrate(); // las pantallas siguientes necesitan los datos cargados
      onLoginSuccess();
    } catch (err) {
      setLoginError((err as Error).message);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleRecoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (API_ENABLED) {
      try {
        await api('/auth/recuperar/', { body: { email: recoverEmail }, auth: false });
      } catch (err) {
        window.alert((err as Error).message);
        return;
      }
    }
    setStage('confirmation');
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (API_ENABLED) {
      try {
        await api('/auth/restablecer/', {
          body: { uid: resetUid, token: resetToken, nueva: newPassword, confirmar: confirmPassword },
          auth: false,
        });
        window.history.replaceState({}, '', window.location.pathname);
      } catch (err) {
        window.alert((err as Error).message);
        return;
      }
    }
    setResetSuccessMessage(true);
    setTimeout(() => {
      setResetSuccessMessage(false);
      setStage('login');
    }, 1500);
  };

  return (
    <div className="flex flex-col min-h-screen text-slate-800 antialiased selection:bg-blue-100 selection:text-blue-900 bg-[#edf3f8]">
      {/* Embedded CSS rules directly connected to GISMAT logo elements */}
      <style>{`
        @keyframes gismatFloatVertical {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-11px);
          }
        }
        .gismat-logo-outer {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transform: scale(1);
          transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), filter 0.4s ease;
          transform-origin: center center;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          will-change: transform;
        }
        .gismat-logo-outer:hover,
        .gismat-logo-outer.is-hovered {
          transform: scale(1.06);
          filter: drop-shadow(0 12px 24px rgba(15, 31, 56, 0.12));
        }
        .gismat-logo-inner {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          animation: gismatFloatVertical 3s ease-in-out infinite;
          transform-origin: center center;
          will-change: transform;
        }
        .gismat-logo-outer:hover .gismat-logo-inner,
        .gismat-logo-outer.is-hovered .gismat-logo-inner {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .gismat-logo-inner {
            animation: none !important;
            transform: none !important;
          }
          .gismat-logo-outer {
            transition: none !important;
          }
          .gismat-logo-outer:hover,
          .gismat-logo-outer.is-hovered {
            transform: none !important;
            filter: none !important;
          }
        }
      `}</style>

      {/* BEGIN: MainHeader */}
      <header
        className="w-full bg-white/90 backdrop-blur-sm border-b border-slate-200 px-6 sm:px-8 py-3.5 flex items-center justify-between"
        data-purpose="header-container"
      >
        <div className="flex items-center gap-3 group cursor-pointer" data-purpose="header-brand">
          {/* Header GISMAT SVG Logo with continuous 3s vertical float and interactive pause & scale */}
          <div className="gismat-logo-outer" data-purpose="header-logo-container">
            <div className="gismat-logo-inner">
              <svg className="w-7 h-9 flex-shrink-0" fill="none" viewBox="0 0 60 78" xmlns="http://www.w3.org/2000/svg">
                <path d="M30 4C17 4 7 14 7 27C7 44 30 70 30 70C30 70 53 44 53 27C53 14 43 4 30 4Z" fill="#15803d" />
                <path d="M30 7C19 7 10 16 10 27C10 42 30 65 30 65C30 65 50 42 50 27C50 16 41 7 30 7Z" fill="#86efac" />
                {/* River inside pin */}
                <path d="M26 12C28 20 20 28 24 38C26 43 23 52 23 55" fill="none" stroke="#0284c7" strokeLinecap="round" strokeWidth="4.5" />
                {/* Leaf inside pin */}
                <path d="M30 50C30 50 44 46 44 30C44 20 34 22 30 29C28 35 30 50 30 50Z" fill="#166534" />
                <path d="M31 30C36 34 40 40 40 40" stroke="#bbf7d0" strokeLinecap="round" strokeWidth="2" />
                {/* Water ripples at base */}
                <ellipse cx="30" cy="73" fill="none" rx="22" ry="4" stroke="#0369a1" strokeWidth="2.5" />
                <ellipse cx="30" cy="74" fill="none" rx="14" ry="2.5" stroke="#0284c7" strokeWidth="2" />
              </svg>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-[17px] font-bold tracking-tight text-[#0060a9] leading-tight">GISMAT</span>
            <span className="text-[11px] font-medium text-slate-500 leading-tight">
              Sistema de Información Geográfica para el Monitoreo Ambiental en Tucumán
            </span>
          </div>
        </div>
      </header>
      {/* END: MainHeader */}

      {/* BEGIN: MainContent */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8" data-purpose="main-layout">
        <div className="w-full max-w-[1020px] transition-all duration-300">
          {/* STAGE 1: LOGIN CARD (CUR 01 - P1) */}
          {stage === 'login' && (
            <section
              className="bg-white rounded-3xl custom-shadow overflow-hidden flex flex-col md:flex-row border border-slate-100 min-h-[560px]"
              id="stage-login"
            >
              {/* Left Side: Map Pin Nature Illustration with Floating & Interactive Animation */}
              <div className="md:w-1/2 bg-[#f4f7fb]/80 flex items-center justify-center p-8 lg:p-12 border-b md:border-b-0 md:border-r border-slate-100 overflow-hidden">
                <div
                  id="gismat-logo-main-wrapper"
                  data-purpose="gismat-main-logo"
                  className="relative w-full max-w-[340px] flex items-center justify-center gismat-login-logo-entrance"
                  title="GISMAT - Sistema de Información Geográfica para el Monitoreo Ambiental"
                >
                  {/* Interactive scale container + Continuous floating 3s container */}
                  <div
                    className={`w-full flex items-center justify-center gismat-logo-outer ${
                      isLogoHovered ? 'is-hovered' : ''
                    }`}
                    onMouseEnter={() => setIsLogoHovered(true)}
                    onMouseLeave={() => setIsLogoHovered(false)}
                    onTouchStart={() => setIsLogoHovered(true)}
                    onTouchEnd={() => setIsLogoHovered(false)}
                    data-purpose="gismat-logo-interactive"
                  >
                    <div className="w-full flex items-center justify-center" data-purpose="gismat-logo-floating">
                      <svg
                        id="gismat-login-logo-svg"
                        className="w-full h-auto drop-shadow-sm select-none"
                        fill="none"
                        viewBox="0 0 360 420"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        {/* Water Ripple Rings underneath pin: soft staggered expansion */}
                        <g>
                          <ellipse className="gismat-ripple-ring gismat-ripple-ring--3" cx="180" cy="370" fill="none" rx="130" ry="24" stroke="#003566" strokeWidth="8" />
                          <ellipse className="gismat-ripple-ring gismat-ripple-ring--2" cx="180" cy="372" fill="none" rx="95" ry="17" stroke="#003566" strokeWidth="6" />
                          <ellipse className="gismat-ripple-ring gismat-ripple-ring--1" cx="180" cy="373" fill="none" rx="55" ry="10" stroke="#003566" strokeWidth="4.5" />
                        </g>

                        {/* Outer Location Pin Gradient Base */}
                        <defs>
                          <linearGradient gradientUnits="userSpaceOnUse" id="pinBorderGrad" x1="60" x2="300" y1="40" y2="340">
                            <stop offset="0%" stopColor="#72b01d" />
                            <stop offset="40%" stopColor="#469d28" />
                            <stop offset="85%" stopColor="#0f5b1d" />
                            <stop offset="100%" stopColor="#093d14" />
                          </linearGradient>
                          <linearGradient gradientUnits="userSpaceOnUse" id="leafGrad" x1="180" x2="300" y1="180" y2="300">
                            <stop offset="0%" stopColor="#6fc939" />
                            <stop offset="100%" stopColor="#26781b" />
                          </linearGradient>
                          <linearGradient gradientUnits="userSpaceOnUse" id="riverGrad" x1="160" x2="190" y1="70" y2="280">
                            <stop offset="0%" stopColor="#93c5fd" />
                            <stop offset="50%" stopColor="#3b82f6" />
                            <stop offset="100%" stopColor="#1d4ed8" />
                          </linearGradient>
                        </defs>

                        {/* Pin Outer Border with rounded teardrop shape */}
                        <path
                          className="gismat-layer-pin"
                          d="M180 348 C180 348 300 248 300 155 C300 75 246 36 180 36 C114 36 60 75 60 155 C60 248 180 348 180 348 Z"
                          fill="url(#pinBorderGrad)"
                        />

                        {/* Pin Inner Mask for Map Grid and Landscape */}
                        <g>
                          <path
                            d="M180 334 C180 334 286 242 286 155 C286 86 238 48 180 48 C122 48 74 86 74 155 C74 242 180 334 180 334 Z"
                            fill="#ffffff"
                          />
                          {/* Subtle Map Grid lines */}
                          <path
                            d="M85 105 L275 105 M76 155 L284 155 M85 205 L275 205 M120 70 L120 240 M180 50 L180 250 M240 70 L240 240"
                            stroke="#e2e8f0"
                            strokeLinecap="round"
                            strokeWidth="3"
                          />
                          <path
                            d="M100 130 L260 130 M150 70 L150 250 M210 70 L210 240"
                            stroke="#f1f5f9"
                            strokeWidth="2"
                          />
                          {/* Mountain Hills within Pin bottom */}
                          <path
                            d="M110 300 C140 230 190 235 220 280 C240 260 270 270 286 300 L286 310 C250 330 200 335 180 334 C150 330 110 310 110 300 Z"
                            fill="#14532d"
                          />
                          <path
                            d="M120 285 C145 245 180 245 205 275"
                            fill="none"
                            opacity="0.4"
                            stroke="#22c55e"
                            strokeWidth="4"
                          />
                          {/* River winding from top to bottom left (vertical drift + soft flowing sheen) */}
                          <g className="gismat-layer-river">
                            <path
                              d="M188 48 C182 85 162 105 168 135 C176 170 148 195 152 230 C156 265 174 275 172 295"
                              fill="none"
                              stroke="url(#riverGrad)"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="17"
                            />
                            <path
                              d="M188 48 C182 85 162 105 168 135 C176 170 148 195 152 230 C156 265 174 275 172 295"
                              fill="none"
                              opacity="0.6"
                              stroke="#60a5fa"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="7"
                            />
                            <path
                              className="gismat-layer-river-flow"
                              d="M188 48 C182 85 162 105 168 135 C176 170 148 195 152 230 C156 265 174 275 172 295"
                              fill="none"
                              pathLength="100"
                              stroke="#dbeafe"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="3.5"
                            />
                          </g>
                          {/* Leaf Overlaid prominently on the right (slight breeze sway) */}
                          <g className="gismat-layer-leaf">
                            <path
                              d="M182 280 C182 280 282 250 282 165 C282 110 220 120 192 165 C175 192 182 280 182 280 Z"
                              fill="url(#leafGrad)"
                            />
                            <path
                              d="M185 275 C205 230 240 180 268 152"
                              fill="none"
                              stroke="#a3e635"
                              strokeLinecap="round"
                              strokeWidth="5"
                            />
                            <path d="M216 230 Q240 232 252 225" stroke="#a3e635" strokeLinecap="round" strokeWidth="3" />
                            <path d="M236 195 Q256 195 268 185" stroke="#a3e635" strokeLinecap="round" strokeWidth="3" />
                          </g>
                        </g>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side: Login Form */}
              <div className="md:w-1/2 p-8 sm:p-12 lg:p-16 flex flex-col justify-center">
                <div className="max-w-[380px] w-full mx-auto flex flex-col h-full justify-between">
                  <div>
                    <h1 className="text-3xl lg:text-[34px] font-bold text-slate-900 tracking-tight leading-tight mb-2">
                      Bienvenido a GISMAT
                    </h1>
                    <p className="text-slate-500 text-sm font-normal mb-8">Iniciá sesión para continuar</p>

                    <form className="space-y-4" id="form-login" onSubmit={handleLoginSubmit}>
                      {/* Username Field */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5" htmlFor="login-username">
                          Usuario
                        </label>
                        <div className="relative flex items-center">
                          <span className="absolute left-3.5 text-slate-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="1.8"
                              />
                            </svg>
                          </span>
                          <input
                            className="w-full pl-11 pr-4 py-3 bg-[#f0f5fd] border border-transparent focus:border-blue-300 rounded-xl text-slate-700 text-sm focus:ring-2 focus:ring-[#005fa8] transition placeholder:text-slate-400"
                            id="login-username"
                            name="username"
                            placeholder="usuarioejemplo"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      {/* Password Field */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5" htmlFor="login-password">
                          Contraseña
                        </label>
                        <div className="relative flex items-center">
                          <span className="absolute left-3.5 text-slate-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="1.8"
                              />
                            </svg>
                          </span>
                          <input
                            className="w-full pl-11 pr-11 py-3 bg-[#f0f5fd] border border-transparent focus:border-blue-300 rounded-xl text-slate-700 text-sm tracking-wider focus:ring-2 focus:ring-[#005fa8] transition placeholder:text-slate-400"
                            id="login-password"
                            name="password"
                            placeholder="••••••••"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                          />
                          <button
                            className="absolute right-3.5 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                            onClick={() => setShowPassword(!showPassword)}
                            title="Mostrar / Ocultar contraseña"
                            type="button"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                              <path
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="1.8"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Remember Me Checkbox */}
                      <div className="flex items-center pt-1 pb-2">
                        <input
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="h-4 w-4 text-[#005fa8] focus:ring-[#005fa8] border-slate-300 rounded bg-[#e8eef8] cursor-pointer"
                          id="remember-me"
                          name="remember-me"
                          type="checkbox"
                        />
                        <label className="ml-2.5 block text-xs font-medium text-slate-600 cursor-pointer" htmlFor="remember-me">
                          Recordar sesión
                        </label>
                      </div>

                      {loginError && (
                        <p role="alert" className="text-xs font-medium text-red-600 -mt-1 pb-1">
                          {loginError}
                        </p>
                      )}

                      {/* Submit Button with exact text INGRESAR */}
                      <button
                        className="w-full bg-[#005fa8] hover:bg-[#004d88] text-white font-semibold py-3 px-6 rounded-xl transition duration-150 flex items-center justify-center gap-2 tracking-wide text-sm shadow-sm cursor-pointer"
                        type="submit"
                        disabled={loggingIn}
                      >
                        <span>INGRESAR</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                          <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </form>
                  </div>

                  {/* Forgot Password Link */}
                  <div className="mt-8 pt-4">
                    <button
                      className="text-xs font-semibold text-[#005fa8] hover:text-[#00467c] inline-flex items-center gap-1 transition cursor-pointer"
                      onClick={() => setStage('recover')}
                      type="button"
                    >
                      ¿Olvidaste tu contraseña?
                      <svg className="w-3.5 h-3.5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* STAGE 2: PASSWORD RECOVERY REQUEST (CUR 01 - P2) */}
          {stage === 'recover' && (
            <section className="max-w-[540px] mx-auto bg-white rounded-3xl custom-shadow p-8 sm:p-12 border border-slate-100 text-center gismat-logo-entrance" id="stage-recover">
              <div className="flex items-center justify-center gap-2.5 mb-6 group cursor-pointer">
                <div className="gismat-logo-float transition-transform duration-300 group-hover:scale-110">
                  <svg className="w-6 h-8" fill="none" viewBox="0 0 60 78" xmlns="http://www.w3.org/2000/svg">
                    <path d="M30 4C17 4 7 14 7 27C7 44 30 70 30 70C30 70 53 44 53 27C53 14 43 4 30 4Z" fill="#005fa8" />
                    <path d="M30 7C22 7 14 15 14 26C14 40 30 63 30 63C30 63 46 40 46 26C46 15 38 7 30 7Z" fill="#10b981" />
                  </svg>
                </div>
                <span className="text-xl font-bold tracking-tight text-slate-800">GISMAT</span>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Recuperar contraseña</h2>
              <p className="text-slate-500 text-xs sm:text-sm max-w-sm mx-auto mb-8 leading-relaxed">
                Ingresá el correo electrónico asociado a tu cuenta y te enviaremos las instrucciones para restablecer tu contraseña.
              </p>
              <form className="space-y-4" id="form-recover" onSubmit={handleRecoverSubmit}>
                <div className="relative flex items-center text-left">
                  <span className="absolute left-3.5 text-slate-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                    </svg>
                  </span>
                  <input
                    className="w-full pl-11 pr-4 py-3 bg-[#f0f5fd] border border-transparent focus:border-blue-300 rounded-xl text-slate-700 text-sm focus:ring-2 focus:ring-[#005fa8] transition placeholder:text-slate-400"
                    placeholder="Correo electrónico"
                    required
                    type="email"
                    value={recoverEmail}
                    onChange={(e) => setRecoverEmail(e.target.value)}
                  />
                </div>
                <button
                  className="w-full bg-[#005fa8] hover:bg-[#004d88] text-white font-semibold py-3 px-6 rounded-xl transition duration-150 tracking-wider text-xs uppercase shadow-sm cursor-pointer"
                  type="submit"
                >
                  ENVIAR INSTRUCCIONES
                </button>
              </form>
              <div className="mt-8">
                <button
                  className="text-xs font-semibold text-[#005fa8] hover:text-[#00467c] inline-flex items-center gap-1.5 transition cursor-pointer"
                  onClick={() => setStage('login')}
                  type="button"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <path d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Volver al inicio de sesión
                </button>
              </div>
            </section>
          )}

          {/* STAGE 3: EMAIL CONFIRMATION SENT (CUR 01 - P3) */}
          {stage === 'confirmation' && (
            <section className="max-w-[540px] mx-auto bg-white rounded-3xl custom-shadow p-8 sm:p-14 border border-slate-100 text-center gismat-logo-entrance" id="stage-confirmation">
              <div className="w-16 h-16 mx-auto rounded-full bg-[#e6f9f0] flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-[#10b981]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">¡Te enviamos un correo!</h2>
              <p className="text-slate-500 text-xs sm:text-sm max-w-sm mx-auto mb-8 leading-relaxed">
                Si el correo ingresado corresponde a una cuenta registrada, recibirás un enlace para restablecer tu contraseña.
              </p>
              <div className="space-y-4">
                <button
                  className="w-full bg-[#005fa8] hover:bg-[#004d88] text-white font-semibold py-3 px-6 rounded-xl transition duration-150 inline-flex items-center justify-center gap-2 tracking-wider text-xs uppercase shadow-sm cursor-pointer"
                  onClick={() => setStage('login')}
                  type="button"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <path d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  VOLVER AL INICIO DE SESIÓN
                </button>
                <div className="pt-3">
                  <p className="text-[11px] text-slate-400">¿No recibiste el correo?</p>
                  <button
                    className="text-xs font-semibold text-[#005fa8] hover:underline cursor-pointer"
                    onClick={() => setStage('reset')}
                    type="button"
                  >
                    Reenviar instrucciones (o simular enlace recibido)
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* STAGE 4: RESET PASSWORD (CUR 01 - P4) */}
          {stage === 'reset' && (
            <section className="max-w-[540px] mx-auto bg-white rounded-3xl custom-shadow p-8 sm:p-12 border border-slate-100 text-left gismat-logo-entrance" id="stage-reset">
              <div className="flex items-center justify-center gap-2.5 mb-6 group cursor-pointer">
                <div className="gismat-logo-float transition-transform duration-300 group-hover:scale-110">
                  <svg className="w-6 h-8" fill="none" viewBox="0 0 60 78" xmlns="http://www.w3.org/2000/svg">
                    <path d="M30 4C17 4 7 14 7 27C7 44 30 70 30 70C30 70 53 44 53 27C53 14 43 4 30 4Z" fill="#15803d" />
                    <path d="M30 7C19 7 10 16 10 27C10 42 30 65 30 65C30 65 50 42 50 27C50 16 41 7 30 7Z" fill="#86efac" />
                  </svg>
                </div>
                <span className="text-xl font-bold tracking-tight text-slate-800">GISMAT</span>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-1">Restablecer contraseña</h2>
              <p className="text-slate-500 text-xs sm:text-sm mb-6">
                Ingresá tu nueva contraseña para recuperar el acceso a tu cuenta.
              </p>

              {resetSuccessMessage && (
                <div className="mb-4 p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-medium border border-emerald-200">
                  ¡Contraseña actualizada exitosamente! Redirigiendo...
                </div>
              )}

              <form className="space-y-4" id="form-reset" onSubmit={handleResetSubmit}>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5" htmlFor="reset-pass-1">
                    Nueva contraseña
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3.5 text-slate-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                      </svg>
                    </span>
                    <input
                      className="w-full pl-11 pr-11 py-3 bg-[#f0f5fd] border border-transparent focus:border-blue-300 rounded-xl text-slate-700 text-sm focus:ring-2 focus:ring-[#005fa8] transition placeholder:text-slate-400"
                      id="reset-pass-1"
                      placeholder="Ingresa la nueva contraseña"
                      type={showResetPass1 ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                    <button
                      className="absolute right-3.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      onClick={() => setShowResetPass1(!showResetPass1)}
                      type="button"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                        <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5" htmlFor="reset-pass-2">
                    Confirmar contraseña
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3.5 text-slate-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                      </svg>
                    </span>
                    <input
                      className="w-full pl-11 pr-11 py-3 bg-[#f0f5fd] border border-transparent focus:border-blue-300 rounded-xl text-slate-700 text-sm focus:ring-2 focus:ring-[#005fa8] transition placeholder:text-slate-400"
                      id="reset-pass-2"
                      placeholder="Repetí tu nueva contraseña"
                      type={showResetPass2 ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                    <button
                      className="absolute right-3.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      onClick={() => setShowResetPass2(!showResetPass2)}
                      type="button"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                        <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                      </svg>
                    </button>
                  </div>
                </div>

                <button
                  className="w-full bg-[#005fa8] hover:bg-[#004d88] text-white font-semibold py-3 px-6 rounded-xl transition duration-150 flex items-center justify-center gap-2 tracking-wide text-xs uppercase shadow-sm mt-2 cursor-pointer"
                  type="submit"
                >
                  <span>GUARDAR CONTRASEÑA</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </form>

              <div className="mt-8 pt-2">
                <button
                  className="text-xs font-semibold text-[#005fa8] hover:text-[#00467c] inline-flex items-center gap-1.5 transition cursor-pointer"
                  onClick={() => setStage('login')}
                  type="button"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <path d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Volver al inicio de sesión
                </button>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
};
