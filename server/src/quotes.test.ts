import { describe, expect, it } from 'vitest';
import { isDisambiguation, plainWiki, quotesOf, searchQuotes } from './quotes';

describe('quotes from Wikiquote (1.19.0-beta.10)', () => {
  it('wikitext to words', () => {
    expect(
      plainWiki(
        "''[[Біблія]] вчить нас [[Любов|любити]]''<ref name=\"a\"/> {{lang|en}}[https://x.org текст]<br/>далі",
      ),
    ).toBe('Біблія вчить нас любити текст\nдалі');
  });
  it('a theme page of uk.wikiquote: its {{Q}} templates with their authors', () => {
    const page = `{{Тема}}
== Цитати про любов ==
* {{Q
| Цитата   = ''Боротися з любов'ю — майже те саме, що боротися з життям<ref name="k"/>.''
| Автор = [[Стефан Жеромський]]
| Оригінал =
}}
{{Q
| Цитата   = Вогонь любові запашний тільки мить!
| Автор = [[Підмогильний Валер'ян Петрович|Валер'ян Підмогильний]], [[Місто (роман)|«Місто»]]}}
== Посилання ==
* [[w:Любов|Любов у Вікіпедії]] — щось довге про посилання на інші сайти`;
    expect(quotesOf(page, 'Любов')).toEqual([
      {
        text: "Боротися з любов'ю — майже те саме, що боротися з життям.",
        author: 'Стефан Жеромський',
      },
      { text: 'Вогонь любові запашний тільки мить!', author: "Валер'ян Підмогильний, «Місто»" },
    ]);
  });
  it('a theme page of en.wikiquote: the author from the line under the quote; a person page is its author', () => {
    const theme = `* When we open up about our emotional challenges, we give others permission.
** [[Reyna I. Aburto]], ''Liahona'' (2019)
* If thy hope be any thing worth, it will purify thee.
** [[Joseph Alleine]]
== Quotes about hope ==
* Not the page's words — about it, from someone.`;
    expect(quotesOf(theme, 'Hope').map((q) => q.author)).toEqual([
      'Reyna I. Aburto',
      'Joseph Alleine',
    ]);
    const person = `== Quotes ==
* The only thing we have to fear is fear itself.
** [[First inaugural address]] (1933)`;
    expect(quotesOf(person, 'Franklin D. Roosevelt')).toEqual([
      { text: 'The only thing we have to fear is fear itself.', author: 'First inaugural address' },
    ]);
  });
  it('a broken template or a stray link leaves the rest; notes over several lines are no quotes', () => {
    const page = `{{Q|Цитата=Розбитий шаблон без кінця [[x}}
{{Q|Цитата=Друга цитата лишається цілою.|Автор=Хтось}}
<!-- коментар
* це не цитата, а рядок коментаря
-->
* Справжня цитата з рядка списку.`;
    expect(quotesOf(page, 'Тест').map((q) => q.text)).toEqual([
      'Друга цитата лишається цілою.',
      'Справжня цитата з рядка списку.',
    ]);
  });
  it('a disambiguation page has no quotes', () => {
    const page =
      "'''Шевченко'''\n{{Неоднозначність}}\n* [[Шевченко Андрій Миколайович]] (нар. 1976) — український футболіст.";
    expect(isDisambiguation(page)).toBe(true);
    expect(quotesOf(page, 'Шевченко')).toEqual([]);
  });
  it('searches: the quotes with the words first, a name gives all of that page', async () => {
    const pages: Record<string, unknown> = {
      search: { query: { search: [{ title: 'Надія' }, { title: 'Іван Франко' }] } },
      Надія: {
        parse: {
          title: 'Надія',
          wikitext:
            '{{Q|Цитата=Надія вмирає останньою.|Автор=[[Народне]]}}\n{{Q|Цитата=Інша думка про щось зовсім інше.|Автор=X}}',
        },
      },
      'Іван Франко': {
        parse: {
          title: 'Іван Франко',
          wikitext:
            '* Не пора, не пора, не пора москалеві й ляхові служить.\n* Лиш боротись — значить жить, і надія не вмира.',
        },
      },
    };
    const fetchImpl = (async (u: string) => {
      const url = new URL(String(u));
      const key =
        url.searchParams.get('list') === 'search' ? 'search' : url.searchParams.get('page')!;
      return new Response(JSON.stringify(pages[key] ?? {}));
    }) as typeof fetch;
    const got = await searchQuotes('надія', 'uk', { fetchImpl });
    if ('refused' in got) throw new Error('refused');
    // the words' quotes first, then the rest of the page named «Надія» (all its quotes are about it)
    expect(got.quotes.map((q) => q.credit)).toEqual([
      'Народне · Вікіцитати',
      'Іван Франко · Вікіцитати',
      'X · Вікіцитати',
    ]);
    const named = await searchQuotes('Франко', 'uk', { fetchImpl });
    if ('refused' in named) throw new Error('refused');
    expect(named.quotes.map((q) => q.text)).toContain(
      'Не пора, не пора, не пора москалеві й ляхові служить.',
    );
    expect(await searchQuotes('  ', 'uk', { fetchImpl })).toEqual({ refused: 'query' });
    const down = (async () => new Response('', { status: 503 })) as typeof fetch;
    expect(await searchQuotes('надія', 'en', { fetchImpl: down })).toEqual({ refused: 'failed' });
  });
});
