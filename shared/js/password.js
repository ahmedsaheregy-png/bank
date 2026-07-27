// ============================================
// SAWYAN BANK - Password Hash Utility
// ============================================
// Uses SHA-256 with salt for password hashing
// All password operations MUST use this utility

window.SAWYAN = window.SAWYAN || {};

window.SAWYAN.Password = {
    SALT: 'sawyan_salt_2024',
    
    /**
     * Hash a password using SHA-256 with salt
     * @param {string} plainPassword - Plain text password
     * @returns {Promise<string>} Hashed password
     */
    async hash: async function(plainPassword) {
        const encoder = new TextEncoder();
        const data = encoder.encode(plainPassword + this.SALT);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },
    
    /**
     * Verify a password against a stored hash
     * @param {string} plainPassword - Plain text password to check
     * @param {string} hashedPassword - Stored password_hash_v2
     * @returns {Promise<boolean>}
     */
    async verify: async function(plainPassword, hashedPassword) {
        const hash = await this.hash(plainPassword);
        return hash === hashedPassword;
    },
    
    /**
     * Create member data object with hashed password
     * @param {object} memberData - Member data without password fields
     * @param {string} plainPassword - Plain text password
     * @returns {Promise<object>} Member data with hashed password fields
     */
    async hashForMemberInsert: async function(memberData, plainPassword) {
        const hashed = await this.hash(plainPassword);
        return {
            ...memberData,
            password_hash: '[HASHED]',
            password_hash_v2: hashed
        };
    }
};
