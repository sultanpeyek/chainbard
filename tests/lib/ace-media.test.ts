import { describe, expect, test } from 'bun:test';
import { extractMediaUrl, extractTaskId } from '@/lib/ace-media';

describe('extractTaskId', () => {
  test('reads .id from a TaskHandle-like object', () => {
    expect(extractTaskId({ id: 'task-1' })).toBe('task-1');
  });

  test('reads top-level task_id', () => {
    expect(extractTaskId({ task_id: 'task-2' })).toBe('task-2');
  });

  test('reads task_id nested under data (object)', () => {
    expect(extractTaskId({ data: { task_id: 'task-3' } })).toBe('task-3');
  });

  test('reads id nested under data array first element', () => {
    expect(extractTaskId({ data: [{ id: 'task-4' }] })).toBe('task-4');
  });

  test('reads task_id nested under response', () => {
    expect(extractTaskId({ response: { task_id: 'task-5' } })).toBe('task-5');
  });

  test('prefers top-level id over nested', () => {
    expect(extractTaskId({ id: 'top', data: { task_id: 'nested' } })).toBe('top');
  });

  test('returns undefined for non-string id or missing shapes', () => {
    expect(extractTaskId({ id: 123 })).toBeUndefined();
    expect(extractTaskId({ foo: 'bar' })).toBeUndefined();
    expect(extractTaskId(undefined)).toBeUndefined();
    expect(extractTaskId(null)).toBeUndefined();
    expect(extractTaskId('task-id')).toBeUndefined();
  });
});

describe('extractMediaUrl', () => {
  test('reads top-level video_url', () => {
    expect(extractMediaUrl({ video_url: 'https://cdn/v.mp4' })).toBe('https://cdn/v.mp4');
  });

  test('reads top-level audio_url', () => {
    expect(extractMediaUrl({ audio_url: 'https://cdn/a.mp3' })).toBe('https://cdn/a.mp3');
  });

  test('reads url under response', () => {
    expect(extractMediaUrl({ response: { url: 'https://cdn/r.mp4' } })).toBe('https://cdn/r.mp4');
  });

  test('reads video_url under data object', () => {
    expect(extractMediaUrl({ data: { video_url: 'https://cdn/d.mp4' } })).toBe('https://cdn/d.mp4');
  });

  test('reads video_url under data array first element', () => {
    expect(extractMediaUrl({ data: [{ video_url: 'https://cdn/da.mp4' }] })).toBe(
      'https://cdn/da.mp4',
    );
  });

  test('reads audio_url under response.data', () => {
    expect(extractMediaUrl({ response: { data: { audio_url: 'https://cdn/rd.mp3' } } })).toBe(
      'https://cdn/rd.mp3',
    );
  });

  test('reads url under response.data array first element', () => {
    expect(extractMediaUrl({ response: { data: [{ url: 'https://cdn/rda.mp4' }] } })).toBe(
      'https://cdn/rda.mp4',
    );
  });

  test('ignores non-http(s) values', () => {
    expect(extractMediaUrl({ video_url: 'ftp://nope' })).toBeUndefined();
    expect(extractMediaUrl({ url: '/relative/path.mp4' })).toBeUndefined();
    expect(extractMediaUrl({ audio_url: 42 })).toBeUndefined();
  });

  test('returns undefined when no media url is present', () => {
    expect(extractMediaUrl({ task_id: 'task-1', status: 'processing' })).toBeUndefined();
    expect(extractMediaUrl(undefined)).toBeUndefined();
    expect(extractMediaUrl(null)).toBeUndefined();
  });
});
