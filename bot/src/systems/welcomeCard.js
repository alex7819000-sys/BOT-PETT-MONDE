/**
 * welcomeCard.js — Image de bienvenue style Etherya
 * 
 * Rendu final (800x280px) :
 * ┌─────────────────────────────────────────────────────┐
 * │  [fond image]                                       │
 * │  overlay sombre                                     │
 * │  bordure arrondie colorée (néon)                    │
 * │                                                     │
 * │   ┌──────┐   pseudo du membre  (couleur accent)     │
 * │   │avatar│   Bienvenue dans {server}                │
 * │   └──────┘   TEAM {server}  (petit, grisé)          │
 * │                                                     │
 * └─────────────────────────────────────────────────────┘
 */

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { AttachmentBuilder }       = require('discord.js');

const W = 800, H = 280;

async function generateWelcomeCard(member, backgroundUrl, accentColor = '#a855f7') {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── 1. Fond ──────────────────────────────────────────────────────────────────
  try {
    const bg = await loadImage(backgroundUrl);
    ctx.drawImage(bg, 0, 0, W, H);
  } catch {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0f0c29'); g.addColorStop(1, '#302b63');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // ── 2. Overlay sombre (dégradé latéral + global) ─────────────────────────────
  // Vignette globale
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(0, 0, W, H);

  // Dégradé noir fort sur la gauche (derrière l'avatar) → transparent vers la droite
  const overlayGrad = ctx.createLinearGradient(0, 0, W * 0.55, 0);
  overlayGrad.addColorStop(0,    'rgba(0,0,0,0.72)');
  overlayGrad.addColorStop(0.45, 'rgba(0,0,0,0.45)');
  overlayGrad.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = overlayGrad;
  ctx.fillRect(0, 0, W, H);

  // ── 3. Bordure néon arrondie ─────────────────────────────────────────────────
  const bw = 3, r = 18;
  // Glow (shadow simulé via plusieurs tracés légèrement transparents)
  for (let i = 3; i >= 1; i--) {
    ctx.strokeStyle = accentColor.replace(')', `, ${0.15 * i})`).replace('rgb', 'rgba').replace('#', 'rgba(').replace(/rgba\(([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/, (_, r, g, b) =>
      `rgba(${parseInt(r,16)},${parseInt(g,16)},${parseInt(b,16)}`);
    ctx.lineWidth = bw + i * 4;
    roundRect(ctx, bw/2, bw/2, W - bw, H - bw, r);
    ctx.stroke();
  }
  // Trait principal
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = bw;
  roundRect(ctx, bw/2, bw/2, W - bw, H - bw, r);
  ctx.stroke();

  // ── 4. Avatar circulaire ─────────────────────────────────────────────────────
  const AV = 120;          // diamètre avatar
  const AX = 90;           // centre X
  const AY = H / 2;        // centre Y

  // Anneau coloré (glow)
  ctx.save();
  ctx.shadowColor = accentColor;
  ctx.shadowBlur  = 18;
  ctx.beginPath();
  ctx.arc(AX, AY, AV / 2 + 5, 0, Math.PI * 2);
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();

  // Clip avatar
  ctx.save();
  ctx.beginPath();
  ctx.arc(AX, AY, AV / 2, 0, Math.PI * 2);
  ctx.clip();
  try {
    const av = await loadImage(member.user.displayAvatarURL({ extension: 'png', size: 256 }));
    ctx.drawImage(av, AX - AV/2, AY - AV/2, AV, AV);
  } catch {
    ctx.fillStyle = '#5865f2';
    ctx.fillRect(AX - AV/2, AY - AV/2, AV, AV);
  }
  ctx.restore();

  // ── 5. Textes ─────────────────────────────────────────────────────────────────
  const TX = AX + AV / 2 + 30;   // X de départ des textes

  // Pseudo (grand, couleur accent)
  ctx.font      = 'bold 34px Sans';
  ctx.fillStyle = accentColor;
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur  = 6;
  ctx.fillText(member.user.username, TX, AY - 18);

  // "Bienvenue dans {server}"
  ctx.font      = 'bold 22px Sans';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Bienvenue dans ${member.guild.name}`, TX, AY + 18);

  // "TEAM {server}" — petit, grisé
  ctx.font      = '15px Sans';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(`TEAM ${member.guild.name.toUpperCase()}`, TX, AY + 46);

  ctx.shadowBlur = 0;

  return canvas.toBuffer('image/png');
}

// Helper rectangle arrondi (path seulement)
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function buildWelcomeAttachment(member, backgroundUrl, accentColor) {
  const buffer = await generateWelcomeCard(member, backgroundUrl, accentColor);
  return new AttachmentBuilder(buffer, { name: 'welcome.png' });
}

module.exports = { generateWelcomeCard, buildWelcomeAttachment };
