import React from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

import styles from './index.module.css';

import exampleImage from '@site/static/img/example.png';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx(styles.heroBanner)}>
      <div className="container">
        <div className={styles.heroContent}>
          <Heading as="h1" className={styles.title}>
            {siteConfig.title}
          </Heading>
          <p className={styles.subtitle}>{siteConfig.tagline}</p>
          <div className={styles.imageContainer}>
            <img src={exampleImage} alt="Example" className={styles.exampleImage} />
          </div>
        </div>
      </div>
    </header>
  );
}


export default function Home(): JSX.Element {
  return (
    <Layout
      title="TemplateDX"
      description="A declarative, extensible & composable type-safe template engine based on Markdown and JSX."
    >
      <HomepageHeader />
    </Layout>
  );
}
