from app.models.types import Identity, PermissionTier, Persona

_PATIENT_ACTIONS = frozenset({"triage", "book", "pay"})
_FAMILY_VIEW_ONLY = frozenset({"view_progress"})
_FAMILY_FULL_ACCESS = frozenset({"view_progress", "book", "pay"})
_PHYSIO_ACTIONS = frozenset({"physio_onboard", "physio_availability"})
_ADMIN_ACTIONS = frozenset({"admin"})
_PARTNER_ACTIONS = frozenset({"partner_refer"})


def authorize(identity: Identity, action: str) -> bool:
    if identity.persona == Persona.PATIENT:
        return action in _PATIENT_ACTIONS
    if identity.persona == Persona.FAMILY:
        if identity.permission_tier == PermissionTier.FULL_ACCESS:
            return action in _FAMILY_FULL_ACCESS
        return action in _FAMILY_VIEW_ONLY
    if identity.persona == Persona.PHYSIO:
        return action in _PHYSIO_ACTIONS
    if identity.persona == Persona.ADMIN:
        return action in _ADMIN_ACTIONS
    if identity.persona == Persona.PARTNER:
        return action in _PARTNER_ACTIONS
    return False
