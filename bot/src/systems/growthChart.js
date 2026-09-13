// src/systems/growthChart.js — Génère un graphique de croissance (arrivées/départs
// par jour) en image, pour rendre /stats croissance beaucoup plus lisible qu'une
// simple liste de chiffres. Même lib que les cartes de bienvenue (@napi-rs/canvas).
'use strict';
const { createCanvas } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');

const W = 900, H = 420;
const PADDING = { top: 50, right: 30, bottom: 60, left: 55 };

function formatDay(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * dailyData: [{ date, joins, leaves, net }] — du plus ancien au plus récent
 */
function renderGrowthChart(dailyData, title = 'Croissance du serveur') {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── Fond ──────────────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1e1f29');
  bg.addColorStop(1, '#15161e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const plotW = W - PADDING.left - PADDING.right;
  const plotH = H - PADDING.top - PADDING.bottom;

  // L'échelle doit couvrir à la fois les barres (toujours ≥0) et la ligne de
  // solde net (qui peut être négative) — sinon la ligne sort du cadre les
  // jours où il y a plus de départs que d'arrivées.
  const maxBar = Math.max(1, ...dailyData.map(d => Math.max(d.joins, d.leaves)));
  const minNet = Math.min(0, ...dailyData.map(d => d.net));
  const yMax = Math.ceil(maxBar * 1.2);
  const yMin = Math.floor(minNet * 1.2);
  const yRange = yMax - yMin;
  const zeroY = PADDING.top + plotH * (yMax / yRange); // position Y représentant la valeur 0
  const valueToY = (v) => zeroY - (v / yRange) * plotH;

  // ── Titre ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(title, PADDING.left, 32);

  // ── Grille horizontale + labels Y ───────────────────────────────────────
  const gridLines = 5;
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= gridLines; i++) {
    const val = yMax - (yRange / gridLines) * i;
    const y = valueToY(val);
    ctx.beginPath();
    ctx.moveTo(PADDING.left, y);
    ctx.lineTo(W - PADDING.right, y);
    ctx.stroke();
    ctx.fillText(String(Math.round(val)), PADDING.left - 10, y + 4);
  }

  // Ligne du zéro plus marquée (repère visuel clair entre positif/négatif)
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.moveTo(PADDING.left, zeroY);
  ctx.lineTo(W - PADDING.right, zeroY);
  ctx.stroke();

  // ── Barres (arrivées en vert, départs en rouge) ─────────────────────────
  const n = dailyData.length;
  const groupW = plotW / n;
  const barW = Math.min(18, groupW * 0.32);

  dailyData.forEach((d, i) => {
    const cx = PADDING.left + groupW * i + groupW / 2;

    // Arrivées (vert) — part toujours de la ligne zéro vers le haut
    ctx.fillStyle = '#57F287';
    const joinY = valueToY(d.joins);
    ctx.fillRect(cx - barW - 2, joinY, barW, zeroY - joinY);

    // Départs (rouge) — affiché aussi vers le haut depuis zéro (comparaison directe),
    // le solde négatif est visible séparément via la ligne jaune
    ctx.fillStyle = '#ED4245';
    const leaveY = valueToY(d.leaves);
    ctx.fillRect(cx + 2, leaveY, barW, zeroY - leaveY);

    // Label X (date) — un jour sur deux si trop de jours pour rester lisible
    if (n <= 14 || i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatDay(d.date), cx, PADDING.top + plotH + 18);
    }
  });

  // ── Ligne "net" (arrivées - départs) par-dessus, en jaune ──────────────
  ctx.strokeStyle = '#FEE75C';
  ctx.lineWidth = 2;
  ctx.beginPath();
  dailyData.forEach((d, i) => {
    const cx = PADDING.left + groupW * i + groupW / 2;
    const netY = valueToY(d.net);
    if (i === 0) ctx.moveTo(cx, netY); else ctx.lineTo(cx, netY);
  });
  ctx.stroke();

  // Petits points sur la ligne net, pour bien voir chaque jour
  ctx.fillStyle = '#FEE75C';
  dailyData.forEach((d, i) => {
    const cx = PADDING.left + groupW * i + groupW / 2;
    const netY = valueToY(d.net);
    ctx.beginPath();
    ctx.arc(cx, netY, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // ── Légende ───────────────────────────────────────────────────────────────
  const legendY = H - 18;
  const legend = [
    { color: '#57F287', label: 'Arrivées' },
    { color: '#ED4245', label: 'Départs' },
    { color: '#FEE75C', label: 'Solde net', isLine: true },
  ];
  let lx = PADDING.left;
  ctx.textAlign = 'left';
  ctx.font = '12px sans-serif';
  for (const item of legend) {
    ctx.fillStyle = item.color;
    if (item.isLine) {
      ctx.fillRect(lx, legendY - 8, 14, 3);
    } else {
      ctx.fillRect(lx, legendY - 10, 12, 12);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(item.label, lx + 20, legendY);
    lx += ctx.measureText(item.label).width + 55;
  }

  return canvas;
}

async function buildGrowthChartAttachment(dailyData, title) {
  const canvas = renderGrowthChart(dailyData, title);
  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'croissance.png' });
}

module.exports = { renderGrowthChart, buildGrowthChartAttachment };
