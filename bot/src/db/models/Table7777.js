'use strict';
const mongoose = require('mongoose');

// Schéma principal — profil d'un utilisateur
const userSchema = new mongoose.Schema({
  userId:           { type: String, required: true },
  guildId:          { type: String, required: true },
  totalRolls:       { type: Number, default: 0 },
  lastRoll:         { type: Date, default: null },
  rolesObtained:    [String],   // IDs des rôles déjà obtenus via 7777
}, { timestamps: true });

userSchema.index({ userId: 1, guildId: 1 }, { unique: true });

// Schéma pour les liaisons chiffre → rôle (configurées par les admins)
const roleMapSchema = new mongoose.Schema({
  guildId:   { type: String, required: true },
  number:    { type: Number, required: true },   // chiffre spécial (ex: 777)
  roleId:    { type: String, required: true },   // ID du rôle Discord
  roleName:  { type: String, default: '' },      // nom affiché (cache)
}, { timestamps: true });

roleMapSchema.index({ guildId: 1, number: 1 }, { unique: true });

module.exports = {
  Table7777UserModel: mongoose.models.Table7777User || mongoose.model('Table7777User', userSchema),
  Table7777RoleMap:   mongoose.models.Table7777RoleMap || mongoose.model('Table7777RoleMap', roleMapSchema),
};
