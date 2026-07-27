// ============================================================================
// 🌳 SAWYAN BANK — Network Tree Helpers (v2 — schema-correct)
// ============================================================================
// Schema صحيح من DB الحقيقي:
//   sawyan.members فيها:
//     id, member_code, full_name, sponsor_id (الراعي الحقيقي),
//     parent_id (المكان المحظوط فيه), position ('left'|'right'),
//     tree_level (الجيل), is_active
//
// RPC functions المتاحة:
//   - get_downline(p_member_id, p_max_depth)
//   - get_uplines(p_member_id, p_max_depth)
//   - is_in_downline(p_ancestor_id, p_descendant_id)
//   - is_placement_available(p_parent_member_id, p_desired_position)
//   - distribute_transaction_commission(p_transaction_id)
// ============================================================================

window.SAWYAN_TREE = {

    // ------------------------------------------------------------------------
    // 1) جلب downline عضو معيّن (لعرض قائمة الـ placement options)
    // ------------------------------------------------------------------------
    async getDownline(memberId, maxDepth = 20) {
        try {
            const { data, error } = await window.SAWYAN.supabase
                .rpc('get_downline', {
                    p_member_id: memberId,
                    p_max_depth: maxDepth
                });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('getDownline RPC error:', err);
            return await this._getDownlineFallback(memberId, maxDepth);
        }
    },

    // fallback: لو الـ function مش موجودة، نـ query مباشر
    async _getDownlineFallback(memberId, maxDepth = 20) {
        try {
            const { data, error } = await window.SAWYAN.supabase
                .from('members')
                .select('id, member_code, full_name, parent_id, position, tree_level, is_active')
                .or(`parent_id.eq.${memberId},sponsor_id.eq.${memberId}`)
                .order('tree_level', { ascending: true });
            if (error) throw error;
            return (data || []).map(m => ({
                id: m.id,
                member_code: m.member_code,
                full_name: m.full_name,
                parent_id: m.parent_id,
                pos: m.position,
                tree_level: m.tree_level,
                depth: Math.max(1, (m.tree_level || 1) - 1)
            }));
        } catch (err) {
            console.error('_getDownlineFallback error:', err);
            return [];
        }
    },

    // ------------------------------------------------------------------------
    // 2) جلب بيانات عضو مع_slots (نحسب left/right من children)
    // ------------------------------------------------------------------------
    async getMemberWithSlots(memberId) {
        try {
            const { data: member, error: mErr } = await window.SAWYAN.supabase
                .from('members')
                .select('id, member_code, full_name, parent_id, position, tree_level, is_active, sponsor_id')
                .eq('id', memberId)
                .single();
            if (mErr) throw mErr;
            if (!member) return null;

            // نجيب أبناءه عشان نعرف الـ slots المتاحة
            const { data: children } = await window.SAWYAN.supabase
                .from('members')
                .select('id, position')
                .eq('parent_id', memberId);

            const hasLeft = (children || []).some(c => c.position === 'left');
            const hasRight = (children || []).some(c => c.position === 'right');

            return {
                ...member,
                left_child_id: hasLeft ? 'taken' : null,
                right_child_id: hasRight ? 'taken' : null
            };
        } catch (err) {
            console.error('getMemberWithSlots error:', err);
            return null;
        }
    },

    // ------------------------------------------------------------------------
    // 3) التحقق إن مكان placement فاضي
    // ------------------------------------------------------------------------
    async isPlacementAvailable(parentId, side) {
        try {
            const { data, error } = await window.SAWYAN.supabase
                .rpc('is_placement_available', {
                    p_parent_member_id: parentId,
                    p_desired_position: side
                });
            if (error) throw error;
            return data === true;
        } catch (err) {
            console.warn('isPlacementAvailable RPC failed, fallback:', err.message);
            // fallback: query مباشر
            const { data, error } = await window.SAWYAN.supabase
                .from('members')
                .select('id')
                .eq('parent_id', parentId)
                .eq('position', side)
                .limit(1);
            if (error) {
                console.error('isPlacementAvailable fallback error:', error);
                return false;
            }
            return !data || data.length === 0;
        }
    },

    // ------------------------------------------------------------------------
    // 4) بناء قائمة الـ placement options
    // ------------------------------------------------------------------------
    async getPlacementOptions(sponsorId, maxDepth = 20) {
        const sponsor = await this.getMemberWithSlots(sponsorId);
        if (!sponsor) return [];

        const downline = await this.getDownline(sponsorId, maxDepth);

        // ضم الـ sponsor نفسه في أول القائمة
        const allOptions = [
            {
                member_id: sponsor.id,
                member_code: sponsor.member_code,
                full_name: sponsor.full_name + ' (الراعي)',
                generation: sponsor.tree_level,
                depth: 0,
                is_sponsor: true,
                _member: sponsor
            },
            ...downline.map(d => ({
                member_id: d.id,
                member_code: d.member_code,
                full_name: d.full_name,
                generation: d.tree_level,
                depth: d.depth,
                is_sponsor: false,
                _member: null  // هنجيبه لما نحتاجه
            }))
        ];

        // لكل عضو، نتحقق من توفر الجهتين
        const optionsWithAvailability = [];
        for (const opt of allOptions) {
            const member = opt._member || await this.getMemberWithSlots(opt.member_id);
            if (!member) continue;

            const leftAvailable = !member.left_child_id;
            const rightAvailable = !member.right_child_id;

            // نعرض العضو لو فيه مكان فاضي على الأقل جهة واحدة
            if (leftAvailable || rightAvailable) {
                optionsWithAvailability.push({
                    ...opt,
                    left_available: leftAvailable,
                    right_available: rightAvailable
                });
            }
        }

        return optionsWithAvailability;
    },

    // ------------------------------------------------------------------------
    // 5) التحقق من صحة الـ placement قبل الـ INSERT
    // ------------------------------------------------------------------------
    async validatePlacement(sponsorId, parentId, side) {
        const errors = [];

        // 1) الـ parent موجود
        const parent = await this.getMemberWithSlots(parentId);
        if (!parent) {
            errors.push('العضو المختار غير موجود');
            return { valid: false, errors };
        }

        // 2) الـ parent هو الـ sponsor نفسه، أو في downline الـ sponsor
        if (parentId !== sponsorId) {
            let inDownline = false;
            try {
                const { data, error } = await window.SAWYAN.supabase
                    .rpc('is_in_downline', {
                        p_ancestor_id: sponsorId,
                        p_descendant_id: parentId
                    });
                if (!error) inDownline = data === true;
            } catch (err) {
                console.warn('is_in_downline RPC failed, skipping check:', err.message);
            }

            if (!inDownline) {
                errors.push('العضو المختار مش في فريق الراعي — ما ينفعش تحط تحته');
                return { valid: false, errors };
            }
        }

        // 3) الجهة فاضية
        const available = await this.isPlacementAvailable(parentId, side);
        if (!available) {
            errors.push(`الجهة الـ ${side === 'left' ? 'يسار' : 'يمين'} تحت العضو ده مأخوذة — اختار جهة تانية أو عضو تاني`);
        }

        return {
            valid: errors.length === 0,
            errors,
            parent
        };
    },

    // ------------------------------------------------------------------------
    // 6) إنشاء عضو جديد مع placement
    // ------------------------------------------------------------------------
    async createMemberWithPlacement(memberData, sponsorId, parentId, side) {
        // validation أولاً
        const validation = await this.validatePlacement(sponsorId, parentId, side);
        if (!validation.valid) {
            throw new Error(validation.errors.join('\n'));
        }

        // إضافة بيانات الـ placement للـ member
        const enrichedData = {
            ...memberData,
            sponsor_id: sponsorId,
            parent_id: parentId,
            position: side,
            is_active: true
            // tree_level بيتحسب أوتوماتيك via trigger
        };

        const { data: newMember, error } = await window.SAWYAN.supabase
            .from('members')
            .insert([enrichedData])
            .select()
            .single();

        if (error) throw error;

        return newMember;
    },

    // ------------------------------------------------------------------------
    // 7) جلب uplines لعضو معيّن
    // ------------------------------------------------------------------------
    async getUplines(memberId, maxCount = 11) {
        try {
            const { data, error } = await window.SAWYAN.supabase
                .rpc('get_uplines', {
                    p_member_id: memberId,
                    p_max_depth: maxCount
                });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('getUplines error:', err);
            return [];
        }
    },

    // ------------------------------------------------------------------------
    // 8) توزيع عمولات معاملة (يُستدعى بعد اعتماد المعاملة)
    // ------------------------------------------------------------------------
    async distributeTransactionCommission(transactionId) {
        try {
            const { data, error } = await window.SAWYAN.supabase
                .rpc('distribute_transaction_commission', {
                    p_transaction_id: transactionId
                });
            if (error) throw error;
            // PostgREST بيرجع array من نتائج الـ function
            return data || null;
        } catch (err) {
            console.error('distributeTransactionCommission error:', err);
            throw err;
        }
    },

    // ------------------------------------------------------------------------
    // 9) حساب حجم الفريق لعضو معيّن
    // ------------------------------------------------------------------------
    async getTeamSize(memberId, maxDepth = 11) {
        try {
            const downline = await this.getDownline(memberId, maxDepth);
            return downline.length + 1; // +1 للعضو نفسه
        } catch (err) {
            console.error('getTeamSize error:', err);
            return 1;
        }
    },

    // ------------------------------------------------------------------------
    // 10) helpers للعرض
    // ------------------------------------------------------------------------
    formatMemberLabel(member) {
        const gen = member.generation || member.tree_level || 1;
        const code = member.member_code || member.member_id?.slice(0, 8);
        const name = member.full_name || 'بدون اسم';
        return `#${code} — ${name} (جيل ${gen})`;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.SAWYAN_TREE;
}
