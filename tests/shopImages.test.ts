import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ShopImages, { productImages, ProductGallery } from '../src/components/shop/ShopImages';
vi.mock('../src/components/shop/useShop', () => ({shopDb:{}}));
(globalThis as any).React = React;
describe('shop image compatibility',()=>{
  it('keeps the old cover first and removes duplicates and unsafe URLs',()=>{
    expect(productImages({image_url:'https://a.test/old.jpg',image_urls:['https://b.test/new.jpg','https://a.test/old.jpg','javascript:alert(1)']})).toEqual(['https://a.test/old.jpg','https://b.test/new.jpg']);
  });
  it('supports legacy cover-only products and caps galleries',()=>{
    expect(productImages({image_url:'https://a.test/old.jpg'})).toHaveLength(1);
    expect(productImages({image_urls:Array.from({length:10},(_,i)=>`https://a.test/${i}.jpg`)})).toHaveLength(8);
  });
  it('offers multiple files only for product uploads',()=>{
    const props={tenantId:'tenant-a',value:[],onChange:()=>{},onBusyChange:()=>{}};
    expect(renderToStaticMarkup(React.createElement(ShopImages,{...props,multiple:true}))).toContain('multiple=""');
    expect(renderToStaticMarkup(React.createElement(ShopImages,props))).not.toContain('multiple=""');
  });
  it('renders every thumbnail and marks the cover selected',()=>{
    const html=renderToStaticMarkup(React.createElement(ProductGallery,{product:{name:'Phone',image_url:'https://a.test/front.jpg',image_urls:['https://a.test/front.jpg','https://a.test/back.jpg']}}));
    expect(html).toContain('Eeg sawirka 2');expect(html).toContain('aria-pressed="true"');
  });
});
