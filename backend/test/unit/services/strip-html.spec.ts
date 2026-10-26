import { EmailService } from '../../../src/services/email.service';

describe('plain-text email', () => {
  const strip = (html: string) => (EmailService.prototype as any).stripHtml.call({}, html);

  it('keeps only the text, even from nested tags', () => {
    expect(strip('<p>Hello <b>Amina</b>,</p>\n\n<p>Your invoice</p>')).toBe('Hello Amina, Your invoice');
    expect(strip('<<b>script>alert(1)<</b>/script>')).toBe('alert(1)');
    expect(strip('a > b')).toBe('a b');
  });

  it('is linear on hostile input', () => {
    const t = Date.now();
    strip('<'.repeat(100_000) + 'x' + '>'.repeat(100_000));
    expect(Date.now() - t).toBeLessThan(1000);
  });
});
