/**
 * Marker base class every future request/response DTO extends, so cross-cutting
 * concerns (e.g. validation options, serialization rules) can be applied consistently
 * as real endpoints are added in later phases.
 */
export abstract class BaseDto {}
