-- Category SEO texts: a long text under the offers (body_html) and category-specific FAQ (JSON [{q,a}]).
-- description_html stays the short lead above the offers.
ALTER TABLE categories ADD COLUMN body_html TEXT NOT NULL DEFAULT '';
ALTER TABLE categories ADD COLUMN faq_json TEXT NOT NULL DEFAULT '';
