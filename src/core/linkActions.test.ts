import { describe, expect, it } from 'vitest';
import { parseLinkAction, stripLinkAction } from './linkActions';

describe('parseLinkAction', () => {
  it('ignores URLs without do', () => {
    expect(parseLinkAction('?foo=1')).toBeNull();
  });
  it('logs a finished open mat with a length', () => {
    expect(parseLinkAction('?do=log&type=open-mat&min=60')).toEqual({ kind: 'log', what: 'open-mat', detail: { min: 60 }, minutesAgo: 0 });
  });
  it('turns toggle with a length into a finished entry', () => {
    expect(parseLinkAction('?do=toggle&type=class&min=90')).toMatchObject({ kind: 'log', what: 'class' });
  });
  it('understands what people say', () => {
    expect(parseLinkAction('?do=start&what=Open Mat')).toMatchObject({ what: 'open-mat' });
    expect(parseLinkAction('?do=start&type=sparring')).toMatchObject({ what: 'roll' });
    expect(parseLinkAction('?do=add&type=tournament')).toMatchObject({ kind: 'log', what: 'comp' });
  });
  it('reads roll details and resolves names', () => {
    const a = parseLinkAction('?do=log&type=roll&partner=Sam&belt=purple&size=heavier&sub=rear naked choke,kimura&tapped=triangle choke&stuck=half guard bottom&outcome=won&ago=10');
    expect(a).toEqual({
      kind: 'log',
      what: 'roll',
      minutesAgo: 10,
      detail: { partner: 'Sam', belt: 'purple', size: 'bigger', subsFor: ['rnc', 'kimura'], subsAgainst: ['triangle'], stuck: ['half-guard'], outcome: 'win' },
    });
  });
  it('reads moves landed and tried in a round', () => {
    expect(parseLinkAction('?do=log&type=roll&landed=knee slice,scissor&tried=berimbolo')).toMatchObject({ detail: { landed: ['knee-cut', 'scissor-sweep'], tried: ['berimbolo'] } });
    expect(parseLinkAction('?do=log&type=open-mat&landed=knee cut')).toMatchObject({ kind: 'invalid' });
  });
  it('reads gi and techniques', () => {
    expect(parseLinkAction('?do=log&type=class&gi=nogi&tech=knee slice,My weird sweep')).toMatchObject({ detail: { attire: 'nogi', techniques: ['knee-cut', 'My weird sweep'] } });
  });
  it('explains bad input', () => {
    expect(parseLinkAction('?do=dance&type=class')).toMatchObject({ kind: 'invalid' });
    expect(parseLinkAction('?do=log')).toMatchObject({ kind: 'invalid', reason: expect.stringContaining('type=class') });
    expect(parseLinkAction('?do=log&type=yoga')).toMatchObject({ kind: 'invalid' });
    expect(parseLinkAction('?do=log&type=class&min=0')).toMatchObject({ kind: 'invalid' });
    expect(parseLinkAction('?do=log&type=class&ago=-5')).toMatchObject({ kind: 'invalid' });
    expect(parseLinkAction('?do=log&type=roll&belt=green')).toMatchObject({ kind: 'invalid' });
    expect(parseLinkAction('?do=log&type=class&partner=Sam')).toMatchObject({ kind: 'invalid', reason: expect.stringContaining('type=roll') });
  });
  it('strips its own parameters only', () => {
    expect(stripLinkAction('https://x.dev/matlog/?do=log&type=class&min=60&keep=1#h')).toBe('/matlog/?keep=1#h');
  });
});

describe('v0.3 link parameters', () => {
  it('reads study, positional rounds and check-ins', () => {
    expect(parseLinkAction('?do=log&type=study&min=10&source=Half guard series')).toMatchObject({ what: 'study', detail: { min: 10, source: 'Half guard series' } });
    expect(parseLinkAction('?do=log&type=roll&from=side control&role=bottom')).toMatchObject({ detail: { start: 'side-control', role: 'bottom' } });
    expect(parseLinkAction('?do=log&type=class&min=60&enjoy=4&plan=partly')).toMatchObject({ detail: { enjoy: 4, plan: 'partly' } });
    expect(parseLinkAction('?do=log&type=class&from=mount')).toMatchObject({ kind: 'invalid' });
    expect(parseLinkAction('?do=log&type=roll&enjoy=4')).toMatchObject({ kind: 'invalid' });
    expect(parseLinkAction('?do=log&type=class&source=x')).toMatchObject({ kind: 'invalid' });
    expect(parseLinkAction('?do=log&type=class&enjoy=9')).toMatchObject({ kind: 'invalid' });
  });
});
