import { ApiError } from '../api/client'

// Marketplace error messages a user can understand; other codes are shown as is.
export function describeMarketError(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'asset_class_rejected':
        return `Asset class rejected: ${e.message}`
      case 'invalid_signature':
        return 'The signature does not match the voucher key registered for this account. Check the voucher key.'
      case 'member_not_active':
        return 'The account is not yet an active member of the circle.'
      case 'epoch_not_open':
        return 'No matching open epoch. A bundle can only be created for the current open epoch.'
      case 'listing_not_open':
        return 'The listing is no longer open (matched, cancelled, or expired).'
      case 'offer_not_open':
        return 'This offer has already been answered or closed.'
      case 'negotiation_closed':
        return 'The negotiation round limit has been reached.'
      case 'rate_limited': {
        const wait = typeof e.details?.retryAfter === 'number' ? e.details.retryAfter : null
        return wait === null ? 'Too many requests. Try again in a moment.' : `Too many requests. Wait ${wait} seconds, then try again.`
      }
      case 'payload_too_large':
        return 'The submitted content is too large for the server. Make it smaller (text, list, or file) and try again.'
      case 'open_limit_reached':
        return 'This account already has too many open orders, invoices, or purchases. Finish or cancel one first, then try again.'
      case 'access_conflict':
        return 'This access has ended, or another grant for the same login and resource still holds it. Wait until that access ends or is revoked; one access cannot be opened twice.'
      case 'provider_grant_failed':
        return `The provider failed to open access: ${e.message}`
      case 'grant_not_owned':
        return 'This provider key belongs to the owner of the broker, and the grant is from another account. Only the owner of the broker can offer grants of this asset type.'
      case 'takedown_invalid':
        return `The takedown was refused: ${e.message}`
      case 'already_exists':
        return `This already exists: ${e.message}`
      case 'code_not_checked':
        return 'This code must be checked with the issuer first (or the last verdict is over 10 minutes old): key not released.'
      case 'code_used':
        return 'The issuer says this code is already used: the purchase and listing are cancelled, the key is not released, and the buyer voucher does not move.'
      case 'code_unknown':
        return 'The issuer does not recognize this code: key not released.'
      case 'code_issuer_unknown':
        return 'This code issuer is not registered on this backend.'
      case 'code_issuer_unavailable':
        return 'The issuer did not respond. No decision yet: try checking again in a moment.'
      case 'code_not_verifiable':
        return 'This code issuer has no check API, so nothing was checked.'
      case 'code_bad_commitment':
        return 'The code and salt do not match the code_commitment in the listing.'
      case 'code_bound_to_identity':
        return 'A code bound to its owner\'s identity cannot be sold.'
      case 'exclusive_taken':
        return 'This code or content has already been sold in this circle.'
      case 'broker_not_configured':
        return 'Access rentals go through the provider\'s broker, and this dashboard has none configured. Ask the provider for its broker, or use a dashboard that points at it.'
      default:
        return `${e.code}: ${e.message}`
    }
  }
  // FE-097: fetch rejects with a TypeError ("Failed to fetch", "Load failed", "NetworkError…" by browser) when a server cannot be reached; say it in words.
  if (e instanceof TypeError) return NETWORK_MESSAGE
  return e instanceof Error ? e.message : String(e)
}

export const NETWORK_MESSAGE = 'The server could not be reached. Check your connection and try again.'
