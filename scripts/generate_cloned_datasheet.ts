import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import {
  renderExportDocumentHtml,
  ExportBlock,
  ExportPageModel,
  ExportPage,
  HtmlBlock,
  TableBlock
} from '../src/server/datasheet/export-renderer';

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin'
  },
  forcePathStyle: true
});

function getLocalOrS3ImageBase64(localFilename: string, storageKey: string, mimeType = 'image/png'): Promise<string> {
  const localPath = path.resolve('scratch', 'assets', localFilename);
  if (fs.existsSync(localPath)) {
    const buf = fs.readFileSync(localPath);
    return Promise.resolve(`data:${mimeType};base64,${buf.toString('base64')}`);
  }
  return getS3ImageBase64(storageKey, mimeType);
}

async function getS3ImageBase64(storageKey: string, mimeType = 'image/png'): Promise<string> {
  try {
    const res = await s3.send(new GetObjectCommand({
      Bucket: process.env.S3_BUCKET || 'pdf-projects',
      Key: storageKey
    }));
    const stream = res.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const buf = Buffer.concat(chunks);
    return `data:${mimeType};base64,${buf.toString('base64')}`;
  } catch (err: any) {
    console.error(`Failed to load image ${storageKey}:`, err.message);
    throw err;
  }
}

async function main() {
  console.log('--- Loading Image Assets ---');
  const baseKey = 'users/6ab3ef0b21901ec243f64aef/projects/6ab3f562d224e8ef204d40ef/extracted/images';

  const imgP1PinConfig = await getLocalOrS3ImageBase64('Pin_Configuration.png', `${baseKey}/page-1/image-19-3.png`);
  const imgP1Fig1 = await getLocalOrS3ImageBase64('Figure_1.png', `${baseKey}/page-1/image-36-4.png`);
  const imgP1Fig2 = await getLocalOrS3ImageBase64('Figure_2.png', `${baseKey}/page-1/image-37-5.png`);
  const imgP4Fig3 = await getLocalOrS3ImageBase64('Figure_3.png', `${baseKey}/page-4/image-49-3.png`);
  const imgP4Fig4 = await getLocalOrS3ImageBase64('Figure_4.png', `${baseKey}/page-4/image-50-4.png`);
  const imgP5BlockDiagram = await getLocalOrS3ImageBase64('Block_Diagram.png', `${baseKey}/page-5/image-60-3.png`);
  const imgP6DieMap = await getLocalOrS3ImageBase64('Die_Location_VS-CW29150R-XX.png', `${baseKey}/page-6/image-65-3.png`);
  const imgP7DieMap = await getLocalOrS3ImageBase64('Die_Location_VS-CW29150R-ADJ.png', `${baseKey}/page-7/image-70-3.png`);
  const imgP8Bonding1 = await getLocalOrS3ImageBase64('Bonding_Diagram_VS-CW29150R-XX.png', `${baseKey}/page-8/image-73-3.png`);
  const imgP8Bonding2 = await getLocalOrS3ImageBase64('Bonding_Diagram_VS-CW29150R-ADJ.png', `${baseKey}/page-8/image-74-4.png`);
  const imgP8Bonding3 = await getLocalOrS3ImageBase64('Bonding_Diagram_VS-CW29151R-XX.png', `${baseKey}/page-8/image-75-5.png`);

  const logoPath = path.resolve('public', 'branding', 'vellore-semicon-logo.svg');
  const logoBase64 = `data:image/svg+xml;base64,${fs.readFileSync(logoPath).toString('base64')}`;

  const template: any = {
    logoAssetPath: logoBase64,
    companyName: 'Vellore Semicon',
    website: 'www.velloresemicon.com',
    productCode: 'VS-CW29150R-XX / VS-CW29150R-ADJ / VS-CW29151R-XX',
    productTitle: '1.5A LOW-DROPOUT REGULATORS',
    documentStatus: 'Preliminary Datasheet',
    revision: 'Rev. A',
    layoutMode: 'two-column',
    layoutDensity: 'technical-dense',
    pageFillStrategy: 'balanced',
    primaryColor: '#0D2B55',
    accentColor: '#D6533E'
  };

  const exportPages: ExportPage[] = [];

  // ==========================================
  // PAGE 1: 2 COLUMNS (Exact Page 1 Layout)
  // ==========================================
  const page1Html: HtmlBlock = {
    kind: 'html',
    role: 'generic',
    fullWidth: true,
    estimatedHeight: 230,
    html: `
    <style>
      .page-1-col p { font-size: 7.6pt; line-height: 1.22; margin: 0 0 1.2mm; color: #1e293b; }
      .page-1-col h2 { font-size: 8.6pt; font-weight: 700; color: #0D2B55; margin: 1.5mm 0 0.8mm; letter-spacing: 0.2px; }
      .page-1-col h2:first-child { margin-top: 0; }
      .page-1-col ul { margin: 0 0 1.2mm 3.2mm; padding-left: 2.8mm; font-size: 7.4pt; line-height: 1.22; color: #1e293b; }
      .page-1-col li { margin-bottom: 0.4mm; }
    </style>
    <div class="technical-columns-flow page-1-col" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 4.8mm; align-items: start;">
      <div class="technical-column technical-column-left">
        <h2>GENERAL DESCRIPTION</h2>
        <p>The VS-CW29150R-XX is high current, high accuracy, low-dropout voltage regulators. Using process with a PNP pass element, these regulators feature 450mV (full load) dropout voltages and very low ground current. These devices also find applications in lower current, low dropout-critical systems, where their tiny dropout voltage and ground current values are important attributes.</p>
        <p>The VS-CW29150R-XX are fully protected against overcurrent faults, reversed input polarity, reversed lead insertion, over temperature operation, and positive and negative transient voltage spikes. Five pin fixed voltage versions feature logic level ON/OFF control and an error flag which signals whenever the output falls out of regulation.</p>
        <p>On the VS-CW29151R-XX and VS-CW29150R-ADJ, the ENABLE pin may be tied to V<sub>IN</sub> if it is not required for ON/OFF control.</p>
        <p>The VS-CW29150R-XX is available in 3- and 5-pin TO-220, TO-263, and TO-252 packages.</p>
        <p>The output voltage &ndash; &laquo;XX&raquo; may be 1.5V, 1.8V, 2.5V, 2.85V, 3V, 3.3V, 5V, 8V, 9V, 12V.</p>

        <h2>FEATURES</h2>
        <ul>
          <li>High Current Capability 1.5A</li>
          <li>Low-Dropout Voltage 450mV</li>
          <li>Low Ground Current</li>
          <li>Accurate 1% Guaranteed Tolerance</li>
          <li>Extremely Fast Transient Response</li>
          <li>Reverse-battery and &ldquo;Load Dump&rdquo; Protection</li>
          <li>Zero-Current Shutdown Mode (5-Pin versions)</li>
          <li>Error Flag Signals Output Out-of-Regulation (5-Pin versions)</li>
          <li>Also Characterized For Smaller Loads With Industry-Leading Performance Specifications</li>
          <li>Fixed Voltage and Adjustable Versions</li>
        </ul>

        <h2>TYPICAL APPLICATION</h2>
        <div class="figure-block" style="display: flex; flex-direction: column; align-items: center; gap: 0.4mm; margin-top: 0.5mm;">
          <img src="${imgP1Fig1}" style="max-height: 23mm; max-width: 90%; object-fit: contain;" alt="Figure 1" />
          <div class="figure-caption" style="font-size: 5.8pt; color: #5c6670; text-align: center;">Figure 1. Fixed output voltage</div>
        </div>
      </div>

      <div class="technical-column technical-column-right">
        <h2>PIN CONFIGURATION</h2>
        <div class="figure-block" style="display: flex; justify-content: center; margin-bottom: 1mm;">
          <img src="${imgP1PinConfig}" style="max-height: 24mm; max-width: 95%; object-fit: contain;" alt="Pin Configuration" />
        </div>

        <h2>PINOUT</h2>
        <p>On all devices, the Tab is grounded.</p>
        <p><strong>VS-CW29150R-XX</strong> &ndash;three terminal devices:<br/>Pin 1 =IN (Input), 2 =GND (Ground), 3 = OUT (Output)</p>
        <p><strong>VS-CW29151R-XX</strong> &ndash;five-terminal fixed voltage devices:<br/>Pin 1 =EN (Enable), 2 = IN (Input), 3 =GND (Ground), 4 =OUT (Output), 5 =FLAG</p>
        <p><strong>VS-CW29150R-ADJ</strong> &ndash;adjustable version with ON/OFF control<br/>Pin 1 = EN (Enable), 2 =IN (Input), 3 =GND (Ground), 4 =OUT (Output), 5 = ADJ (Adjust)</p>

        <h2>APPLICATIONS</h2>
        <ul>
          <li>Battery Powered Equipment</li>
          <li>High-Efficiency &ldquo;Green&rdquo; Computer Systems</li>
          <li>Automotive Electronics</li>
          <li>High-Efficiency Linear Power Supplies</li>
          <li>High-Efficiency Post-Regulator For Switching Supply</li>
        </ul>

        <div class="figure-block" style="display: flex; flex-direction: column; align-items: center; gap: 0.4mm; margin-top: 0.5mm;">
          <img src="${imgP1Fig2}" style="max-height: 31mm; max-width: 90%; object-fit: contain;" alt="Figure 2" />
          <div class="figure-caption" style="font-size: 5.6pt; color: #5c6670; text-align: center; line-height: 1.15;">
            Figure 2. Adjustable output voltage configuration. For best results, the total series resistance should be small enough to pass the minimum regulator load current.
          </div>
        </div>
      </div>
    </div>
    `
  };
  exportPages.push({ blocks: [page1Html], usedHeight: 230, locked: true, layoutMode: 'single-column' });

  // ==========================================
  // PAGE 2: SINGLE COLUMN (Tables Part 1)
  // ==========================================
  const page2Html: HtmlBlock = {
    kind: 'html',
    role: 'generic',
    fullWidth: true,
    estimatedHeight: 235,
    html: `
    <h2>ABSOLUTE MAXIMUM RATINGS</h2>
    <table class="technical-table" style="width: 100%; border-collapse: collapse; margin-bottom: 1.8mm; font-size: 6.8pt;">
      <thead>
        <tr>
          <th style="width: 44%; text-align: left;">Parameter</th>
          <th style="width: 16%; text-align: left;">Symbol</th>
          <th style="width: 25%; text-align: left;">Ratings</th>
          <th style="width: 15%; text-align: left;">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Power Dissipation</td><td>P<sub>D</sub></td><td>Internally Limited</td><td></td></tr>
        <tr><td>Lead Temperature (soldering, 5 seconds)</td><td>-</td><td>260</td><td>&deg;C</td></tr>
        <tr><td>Storage Temperature Range</td><td>T<sub>STG</sub></td><td>-65 to 150</td><td>&deg;C</td></tr>
        <tr><td>Input Supply Voltage</td><td>V<sub>IN</sub></td><td>- 5 to +30</td><td>V</td></tr>
      </tbody>
    </table>

    <h2>RECOMMENDED OPERATING CONDITIONS</h2>
    <table class="technical-table" style="width: 100%; border-collapse: collapse; margin-bottom: 1.8mm; font-size: 6.8pt;">
      <thead>
        <tr>
          <th style="width: 44%; text-align: left;">Parameter</th>
          <th style="width: 16%; text-align: left;">Symbol</th>
          <th style="width: 25%; text-align: left;">Ratings</th>
          <th style="width: 15%; text-align: left;">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Input Voltage</td><td>V<sub>IN</sub></td><td>2.3 to 20</td><td>V</td></tr>
        <tr><td>Junction Temperature</td><td>T<sub>J</sub></td><td>-40 to 125</td><td>&deg;C</td></tr>
      </tbody>
    </table>

    <h2>ELECTRICAL CHARACTERISTICS</h2>
    <p style="font-size: 6.7pt; line-height: 1.25; margin-bottom: 1.2mm;">
      All measurements at T<sub>J</sub> = 25&deg;C, I<sub>OUT</sub> = 10mA, V<sub>IN</sub> = V<sub>OUT</sub> +1V, unless otherwise noted. The <strong>bold</strong> values are guaranteed across the operating temperature range. Adjustable versions are programmed to 5.0V.
    </p>

    <table class="technical-table" style="width: 100%; border-collapse: collapse; font-size: 6.15pt; line-height: 1.15;">
      <thead>
        <tr>
          <th style="width: 23%; text-align: left;">Parameter</th>
          <th style="width: 11%; text-align: left;">Symbol</th>
          <th style="width: 34%; text-align: left;">Conditions</th>
          <th style="width: 8%; text-align: center;">Min</th>
          <th style="width: 8%; text-align: center;">Typ</th>
          <th style="width: 8%; text-align: center;">Max</th>
          <th style="width: 8%; text-align: left;">Unit</th>
        </tr>
        <tr style="background: #f1f5f9; color: #64748b; font-size: 5.6pt;">
          <th style="text-align: center;">1</th>
          <th style="text-align: center;">2</th>
          <th style="text-align: center;">3</th>
          <th style="text-align: center;">4</th>
          <th style="text-align: center;">5</th>
          <th style="text-align: center;">6</th>
          <th style="text-align: center;">7</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Output Voltage</td>
          <td>V<sub>OUT</sub></td>
          <td>I<sub>OUT</sub> = 10mA</td>
          <td style="text-align: center;"><strong>-1</strong></td>
          <td></td>
          <td style="text-align: center;"><strong>1</strong></td>
          <td>%</td>
        </tr>
        <tr>
          <td></td>
          <td></td>
          <td>10mA &le; I<sub>OUT</sub> &le; 1.5A, (V<sub>OUT</sub> + 1V) &le; V<sub>IN</sub> &le; 20V</td>
          <td style="text-align: center;"><strong>-2</strong></td>
          <td></td>
          <td style="text-align: center;"><strong>2</strong></td>
          <td></td>
        </tr>
        <tr>
          <td>Line Regulation</td>
          <td>LNR</td>
          <td>I<sub>OUT</sub> = 10mA, (V<sub>OUT</sub> + 1V) &le; V<sub>IN</sub> &le; 20V</td>
          <td></td>
          <td style="text-align: center;">0.06</td>
          <td style="text-align: center;">0.5</td>
          <td>%</td>
        </tr>
        <tr>
          <td>Load Regulation</td>
          <td>LDR</td>
          <td>V<sub>IN</sub> = V<sub>OUT</sub> + 5V, 10mA &le; I<sub>OUT</sub> &le; 1.5A (Note 1)</td>
          <td></td>
          <td style="text-align: center;">0.2</td>
          <td style="text-align: center;">1</td>
          <td></td>
        </tr>
        <tr>
          <td>Output Voltage Temperature Coefficient</td>
          <td>&Delta;V<sub>OUT</sub> / &Delta;T</td>
          <td>(Note 2)</td>
          <td></td>
          <td style="text-align: center;"><strong>20</strong></td>
          <td style="text-align: center;"><strong>100</strong></td>
          <td>ppm/&deg;C</td>
        </tr>
        <tr>
          <td>Dropout Voltage</td>
          <td>&Delta;V<sub>DROP</sub></td>
          <td>
            &Delta;V<sub>OUT</sub> = -1%, (Notes 1, 3)<br/>
            I<sub>OUT</sub> = 100mA<br/>
            I<sub>OUT</sub> = 750mA<br/>
            I<sub>OUT</sub> = 1.5A
          </td>
          <td></td>
          <td style="text-align: center;">100<br/>300<br/>450</td>
          <td style="text-align: center;"><strong>220</strong><br/><br/><strong>700</strong></td>
          <td>mV</td>
        </tr>
        <tr>
          <td>Ground Current</td>
          <td>I<sub>Q</sub></td>
          <td>
            (Notes 1, 4) I<sub>OUT</sub> = 750mA, V<sub>IN</sub> = V<sub>OUT</sub> + 1V<br/>
            I<sub>OUT</sub> = 1.5A
          </td>
          <td></td>
          <td style="text-align: center;">8<br/>22</td>
          <td style="text-align: center;"><strong>20</strong><br/>&nbsp;</td>
          <td>mA</td>
        </tr>
        <tr>
          <td></td>
          <td></td>
          <td>
            (Notes 1, 4, 9) I<sub>OUT</sub> = 750mA, V<sub>IN</sub> = V<sub>OUT</sub> + 1V<br/>
            I<sub>OUT</sub> = 1.5A
          </td>
          <td></td>
          <td style="text-align: center;">20<br/>50</td>
          <td style="text-align: center;"><strong>30</strong><br/>&nbsp;</td>
          <td></td>
        </tr>
        <tr>
          <td>I<sub>GNDDO</sub> Ground Pin Current at Dropout</td>
          <td>I<sub>Q(DROP)</sub></td>
          <td>V<sub>IN</sub> = 0.5V less than specified V<sub>OUT</sub>, I<sub>OUT</sub> = 10mA (Note 5)</td>
          <td></td>
          <td style="text-align: center;">2</td>
          <td></td>
          <td>mA</td>
        </tr>
        <tr>
          <td>Current Limit</td>
          <td>I<sub>OUT_MAX</sub></td>
          <td>V<sub>OUT</sub> = 0V (Note 1)</td>
          <td></td>
          <td style="text-align: center;">3.8</td>
          <td style="text-align: center;"><strong>4.5</strong></td>
          <td>A</td>
        </tr>
        <tr>
          <td></td>
          <td></td>
          <td>V<sub>OUT</sub> = 0V (Notes 1, 9)</td>
          <td></td>
          <td style="text-align: center;">2.5</td>
          <td style="text-align: center;"><strong>3.5</strong></td>
          <td></td>
        </tr>
        <tr style="background: #e9f0f6; font-weight: 700; color: #0D2B55;">
          <td colspan="7">REFERENCE VS-CW29150R-ADJ</td>
        </tr>
        <tr>
          <td>Reference Voltage</td>
          <td>V<sub>REF</sub></td>
          <td></td>
          <td style="text-align: center;">1.228<br/><strong>1.215</strong></td>
          <td style="text-align: center;">1.240</td>
          <td style="text-align: center;">1.252<br/><strong>1.265</strong></td>
          <td>V</td>
        </tr>
        <tr>
          <td>Reference Voltage</td>
          <td>V<sub>REF</sub></td>
          <td>(Note 6)</td>
          <td style="text-align: center;"><strong>1.203</strong></td>
          <td></td>
          <td style="text-align: center;"><strong>1.277</strong></td>
          <td>V</td>
        </tr>
        <tr>
          <td>Adjust Pin Bias Current</td>
          <td>I<sub>ADJ</sub></td>
          <td></td>
          <td></td>
          <td style="text-align: center;">20</td>
          <td style="text-align: center;">80<br/><strong>120</strong></td>
          <td>nA</td>
        </tr>
        <tr>
          <td>Reference Voltage Temperature Coefficient</td>
          <td>&Delta;V<sub>REF</sub> / &Delta;T</td>
          <td>(Note 2)</td>
          <td></td>
          <td style="text-align: center;">20</td>
          <td></td>
          <td>ppm/&deg;C</td>
        </tr>
        <tr>
          <td>Adjust pin bias current temperature coefficient</td>
          <td>&Delta;I<sub>ADJ</sub> / &Delta;T</td>
          <td></td>
          <td></td>
          <td style="text-align: center;">0.1</td>
          <td></td>
          <td>nA/&deg;C</td>
        </tr>
        <tr style="background: #e9f0f6; font-weight: 700; color: #0D2B55;">
          <td colspan="7">FLAG OUTPUT (Error Comparator) VS-CW29151R-XX</td>
        </tr>
      </tbody>
    </table>
    `
  };
  exportPages.push({ blocks: [page2Html], usedHeight: 235, locked: true, layoutMode: 'single-column' });

  // ==========================================
  // PAGE 3: SINGLE COLUMN (Tables Part 2 + Notes)
  // ==========================================
  const page3Html: HtmlBlock = {
    kind: 'html',
    role: 'generic',
    fullWidth: true,
    estimatedHeight: 230,
    html: `
    <table class="technical-table" style="width: 100%; border-collapse: collapse; font-size: 6.2pt; line-height: 1.15; margin-bottom: 3.5mm;">
      <thead>
        <tr>
          <th style="width: 23%; text-align: left;">Parameter</th>
          <th style="width: 11%; text-align: left;">Symbol</th>
          <th style="width: 34%; text-align: left;">Conditions</th>
          <th style="width: 8%; text-align: center;">Min</th>
          <th style="width: 8%; text-align: center;">Typ</th>
          <th style="width: 8%; text-align: center;">Max</th>
          <th style="width: 8%; text-align: left;">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Output Leakage Current</td>
          <td>V<sub>FL_H</sub></td>
          <td>V<sub>OH</sub> = 26V</td>
          <td></td>
          <td style="text-align: center;">0.01</td>
          <td style="text-align: center;">1.00<br/><strong>2.00</strong></td>
          <td>&mu;A</td>
        </tr>
        <tr>
          <td>Output Low Voltage</td>
          <td>V<sub>FL_L</sub></td>
          <td>V<sub>IN</sub> = 0.5V less than specified V<sub>OUT</sub>, I<sub>OL</sub> = 250&mu;A (Note 5)</td>
          <td></td>
          <td style="text-align: center;">220</td>
          <td style="text-align: center;">300<br/><strong>400</strong></td>
          <td>mV</td>
        </tr>
        <tr>
          <td>Upper Threshold Voltage</td>
          <td>V<sub>OUT-TH-H</sub></td>
          <td>(Note 5)</td>
          <td></td>
          <td></td>
          <td style="text-align: center;">99.2</td>
          <td>% of V<sub>OUT</sub></td>
        </tr>
        <tr>
          <td>Lower Threshold Voltage</td>
          <td>V<sub>OUT-TH-L</sub></td>
          <td>(Note 5)</td>
          <td style="text-align: center;">93</td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td>Hysteresis</td>
          <td>&Delta;V<sub>OUT-TH</sub></td>
          <td>(Note 5)</td>
          <td></td>
          <td style="text-align: center;">1</td>
          <td></td>
          <td></td>
        </tr>
        <tr style="background: #e9f0f6; font-weight: 700; color: #0D2B55;">
          <td colspan="7">ENABLE Input VS-CW29151R-XX, VS-CW29150R-ADJ</td>
        </tr>
        <tr>
          <td>Input Logic Voltage:<br/>Low (OFF)<br/>High (ON)</td>
          <td>V<sub>EN-TH-L</sub><br/>V<sub>EN-TH-H</sub></td>
          <td></td>
          <td style="text-align: center;"><br/><strong>2.4</strong></td>
          <td></td>
          <td style="text-align: center;"><strong>0.8</strong><br/>&nbsp;</td>
          <td>V</td>
        </tr>
        <tr>
          <td>Enable Pin Input Current</td>
          <td>I<sub>EN</sub></td>
          <td>V<sub>EN</sub> = 26V</td>
          <td></td>
          <td style="text-align: center;">30</td>
          <td style="text-align: center;">600<br/><strong>750</strong></td>
          <td>&mu;A</td>
        </tr>
        <tr>
          <td></td>
          <td></td>
          <td>V<sub>EN</sub> = 0.8V</td>
          <td></td>
          <td></td>
          <td style="text-align: center;">2.5<br/><strong>5</strong></td>
          <td></td>
        </tr>
        <tr>
          <td>Regulator Output Current Shutdown</td>
          <td>I<sub>OUT-SD</sub></td>
          <td>(Note 7)</td>
          <td></td>
          <td style="text-align: center;">10</td>
          <td style="text-align: center;"><br/><strong>500</strong></td>
          <td>&mu;A</td>
        </tr>
      </tbody>
    </table>

    <div style="font-size: 6.8pt; line-height: 1.32; color: #334155;">
      <p style="margin: 0 0 1.2mm;"><em>Note 1: Employ pulse-testing procedures to minimize temperature rise.</em></p>
      <p style="margin: 0 0 1.2mm;"><em>Note 2: Output voltage temperature coefficient is defined as the worst case voltage change divided by the total temperature range.</em></p>
      <p style="margin: 0 0 1.2mm;"><em>Note 3: Dropout voltage is defined as the input-to-output differential when the output voltage drops to 99% of its nominal value with V<sub>OUT</sub> + 1V applied to V<sub>IN</sub>. For output voltages below 2.3V dropout voltage is the input-to-output voltage differential with the minimum input voltage being 2.3V. Minimum input operation voltage is 2.3V.</em></p>
      <p style="margin: 0 0 1.2mm;"><em>Note 4: Ground pin current is the regulator quiescent current. The total current drawn from the source is the sum of the load current plus the ground pin current.</em></p>
      <p style="margin: 0 0 1.2mm;"><em>Note 5: For specified V<sub>OUT</sub> &ge; 2.5V</em></p>
      <p style="margin: 0 0 1.2mm;"><em>Note 6: V<sub>REF</sub> &le; V<sub>OUT</sub> &le; (V<sub>IN</sub>-1V), 2.3V &le; V<sub>IN</sub> &le; 20V, 10mA &le; I<sub>L</sub> &le; 1.5A, T<sub>J</sub> &lt; T<sub>J MAX</sub>.</em></p>
      <p style="margin: 0 0 1.2mm;"><em>Note 7: V<sub>EN</sub> &le; 0.8V and V<sub>IN</sub> &le; 20V, V<sub>OUT</sub> = 0</em></p>
      <p style="margin: 0 0 1.2mm;"><em>Note 8: When used in dual supply systems where the regulator load is returned to a negative supply, the output voltage must be diode clamped to ground.</em></p>
      <p style="margin: 0 0 1.2mm;"><em>Note 9: Devices tested at 100Krad irradiation</em></p>
    </div>
    `
  };
  exportPages.push({ blocks: [page3Html], usedHeight: 230, locked: true, layoutMode: 'single-column' });

  // ==========================================
  // PAGE 4: 2 COLUMNS (Application Information & Thermal Design)
  // ==========================================
  const page4Html: HtmlBlock = {
    kind: 'html',
    role: 'generic',
    fullWidth: true,
    estimatedHeight: 235,
    html: `
    <style>
      .page-4-col p { font-size: 7.5pt; line-height: 1.22; margin: 0 0 1.2mm; color: #1e293b; }
      .page-4-col h2 { font-size: 8.6pt; font-weight: 700; color: #0D2B55; margin: 1.5mm 0 0.8mm; letter-spacing: 0.2px; }
      .page-4-col h2:first-child { margin-top: 0; }
      .page-4-col ul { margin: 0 0 1.2mm 3.2mm; padding-left: 2.8mm; font-size: 7.4pt; line-height: 1.22; color: #1e293b; }
      .page-4-col li { margin-bottom: 0.4mm; }
    </style>
    <div class="technical-columns-flow page-4-col" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 4.8mm; align-items: start;">
      <div class="technical-column technical-column-left">
        <h2>APPLICATION INFORMATION</h2>
        <p>The VS-CW29150R-XX is high performance low-dropout voltage regulators suitable for all moderate to high-current voltage regulator applications. Their 450mV dropout voltage at full load makes them especially valuable in battery powered systems and as high efficiency noise filters in &ldquo;post-regulator&rdquo; applications. Unlike older NPN-pass transistor designs, dropout performance of the PNP output of these devices is limited merely by the low V<sub>CE</sub> saturation voltage.</p>
        <p>The VS-CW29150R-XX family of regulators is fully protected from damage due to fault conditions. Current limiting is provided. This limiting is linear; output current under overload conditions is constant. Thermal shutdown disables the device when the die temperature exceeds the 125&deg;C maximum safe operating temperature. Transient protection allows device survival even when the input voltage spikes between &ndash;20V and +30V. When the input voltage exceeds about 28V to 33V, the over voltage sensor temporarily disables the regulator.</p>

        <div class="figure-block" style="display: flex; flex-direction: column; align-items: center; gap: 0.4mm; margin: 1.5mm 0;">
          <img src="${imgP4Fig3}" style="max-height: 22mm; max-width: 90%; object-fit: contain;" alt="Figure 3" />
          <div class="figure-caption" style="font-size: 5.8pt; color: #5c6670; text-align: center;">
            Figure 3. Linear regulators require only two capacitors for operation.
          </div>
        </div>

        <h2>THERMAL DESIGN</h2>
        <p>Linear regulators are simple to use. The most complicated design parameters to consider are thermal characteristics. Thermal design requires the following application-specific parameters:</p>
        <ul>
          <li>Maximum Ambient Temperature, T<sub>A</sub></li>
          <li>Output Current, I<sub>OUT</sub></li>
          <li>Output Voltage, V<sub>OUT</sub></li>
          <li>Input Voltage, V<sub>IN</sub></li>
        </ul>
        <p>First, we calculate the power dissipation of the regulator from these numbers and the device parameters from this datasheet.</p>
        <div style="text-align: center; margin: 1mm 0; font-weight: 600; font-size: 7.4pt; color: #0D2B55;">
          P<sub>D</sub> = I<sub>OUT</sub> (1.01V<sub>IN</sub> - V<sub>OUT</sub>)
        </div>
        <p style="margin-top: 0.8mm;">where the ground current is approximated by 1% of I<sub>OUT</sub>. Then the heat sink thermal resistance is determined with this formula:</p>
      </div>

      <div class="technical-column technical-column-right">
        <div style="text-align: center; margin: 0 0 1.5mm; font-weight: 600; font-size: 7.2pt; color: #0D2B55; line-height: 1.25;">
          &theta;<sub>SA</sub> = (T<sub>J MAX</sub> - T<sub>A</sub>)/P<sub>D</sub> - (&theta;<sub>JC</sub> + &theta;<sub>CS</sub>),<br/>
          <span style="font-size: 6.6pt; font-weight: normal; color: #334155;">where T<sub>J MAX</sub> &le; 125&deg;C and &theta;<sub>CS</sub> is between 0 and 2&deg;C/W</span>
        </div>

        <h2>CAPACITOR REQUIREMENTS</h2>
        <p>For stability and minimum output noise, a capacitor on the regulator output is necessary. The value of this capacitor is dependent upon the output current; lower currents allow smaller capacitors. VS-CW29150R-XX regulators are stable with the 10&mu;F minimum capacitor values at full load. Where the regulator is powered from a source with a high AC impedance, a 0.1&mu;F capacitor connected between Input and GND is recommended. This capacitor should have good characteristics to above 250kHz.</p>

        <h2>MINIMUM LOAD CURRENT</h2>
        <p>The VS-CW29150R-XX regulators are specified between finite loads. If the output current is too small, leakage currents dominate and the output voltage rises. The 5mA minimum load current swamps any expected leakage current across the operating temperature range.</p>

        <h2>ADJUSTABLE REGULATOR DESIGN</h2>
        <div class="figure-block" style="display: flex; flex-direction: column; align-items: center; gap: 0.4mm; margin: 1.2mm 0;">
          <img src="${imgP4Fig4}" style="max-height: 29mm; max-width: 90%; object-fit: contain;" alt="Figure 4" />
          <div class="figure-caption" style="font-size: 5.8pt; color: #5c6670; text-align: center;">
            Figure 4. Adjustable Regulator with Resistors
          </div>
        </div>

        <p style="margin-top: 0.8mm;">
          The adjustable regulator version, VS-CW29150R-ADJ, allows programming the output voltage anywhere between 1.25V and the 20V maximum operating rating of the family. Two resistors are used. Resistors can be quite large, up to 1M&Omega;, because of the very high input impedance and low bias current of the sense comparator: The resistor values are calculated by:
        </p>
      </div>
    </div>
    `
  };
  exportPages.push({ blocks: [page4Html], usedHeight: 235, locked: true, layoutMode: 'single-column' });

  // ==========================================
  // PAGE 5: 2 COLUMNS TOP + FULL-WIDTH BLOCK DIAGRAM
  // ==========================================
  const page5Html: HtmlBlock = {
    kind: 'html',
    role: 'generic',
    fullWidth: true,
    estimatedHeight: 235,
    html: `
    <div class="technical-columns-flow" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 4.8mm; align-items: start; margin-bottom: 2mm;">
      <div class="technical-column technical-column-left">
        <div style="margin: 0 0 1.5mm; font-weight: 600; font-size: 7.8pt; color: #0D2B55;">
          R<sub>1</sub> = R<sub>2</sub> (V<sub>OUT</sub> / 1.240 - 1),
        </div>
        <p style="margin-bottom: 1.5mm;">where V<sub>OUT</sub> is the desired output voltage. Figure 4 shows component definition. Applications with widely varying load currents may scale the resistors to draw the minimum load current required for proper operation.</p>

        <h2>ERROR FLAG</h2>
        <p style="margin-bottom: 0;">The VS-CW29151R-XX version features an Error Flag, which looks at the output voltage and signals an error condition when this voltage drops 5% below its expected value. The error flag is an open-collector output that pulls low under fault conditions. It may sink 10mA. Low output voltage</p>
      </div>

      <div class="technical-column technical-column-right">
        <p style="margin-bottom: 2mm;">signifies a number of possible problems, including an over-current fault (the device is in current limit) and low input voltage. The flag output is inoperative during over temperature shutdown conditions.</p>

        <h2>ENABLE INPUT</h2>
        <p style="margin-bottom: 0;">VS-CW29150R-ADJ and VS-CW29151R-XX versions feature an enable (EN) input that allows ON/OFF control of the device. Special design allows &ldquo;zero&rdquo; current drain when the device is disabled &mdash; only microamperes of leakage current flows. The EN input has TTL/CMOS compatible thresholds for simple interfacing with logic, or may be directly tied to &le;30V. Enabling the regulator requires approximately 20&mu;A of current.</p>
      </div>
    </div>

    <div style="width: 100%; margin-top: 1mm;">
      <h2 style="margin-bottom: 1.5mm;">BLOCK DIAGRAM</h2>
      <div style="display: flex; justify-content: center; width: 100%; margin-bottom: 1.5mm;">
        <img src="${imgP5BlockDiagram}" style="max-height: 100mm; max-width: 95%; object-fit: contain;" alt="Block Diagram" />
      </div>
      <div style="text-align: center; font-size: 6.8pt; color: #46505a; line-height: 1.25;">
        *Feedback network in fixed versions only<br/>
        **Adjustable version only
      </div>
    </div>
    `
  };
  exportPages.push({ blocks: [page5Html], usedHeight: 235, locked: true, layoutMode: 'single-column' });

  // ==========================================
  // PAGE 6: SINGLE COLUMN (Die Map CW29150R-XX)
  // ==========================================
  const page6Html: HtmlBlock = {
    kind: 'html',
    role: 'generic',
    fullWidth: true,
    estimatedHeight: 230,
    html: `
    <h2 style="text-align: center; margin-bottom: 1.5mm; font-size: 11pt;">PAD LOCATION AND COORDINATES</h2>
    <h3 style="text-align: center; margin-bottom: 3.5mm; font-size: 9.5pt; color: #0D2B55;">VS-CW29150R-XX</h3>
    <div style="display: flex; justify-content: center; align-items: center; width: 100%; margin-top: 2mm;">
      <img src="${imgP6DieMap}" style="width: 96%; max-height: 185mm; object-fit: contain; border: 1px solid #111;" alt="Die Location VS-CW29150R-XX" />
    </div>
    `
  };
  exportPages.push({ blocks: [page6Html], usedHeight: 230, locked: true, layoutMode: 'single-column' });

  // ==========================================
  // PAGE 7: SINGLE COLUMN (Die Map CW29150R-ADJ + Coordinates Table)
  // ==========================================
  const page7Html: HtmlBlock = {
    kind: 'html',
    role: 'generic',
    fullWidth: true,
    estimatedHeight: 240,
    html: `
    <h3 style="text-align: center; margin-bottom: 2mm; font-size: 9.5pt; color: #0D2B55;">VS-CW29150R-ADJ</h3>
    <div style="display: flex; justify-content: center; align-items: center; width: 100%; margin-bottom: 2.5mm;">
      <img src="${imgP7DieMap}" style="width: 96%; max-height: 108mm; object-fit: contain; border: 1px solid #111;" alt="Die Location VS-CW29150R-ADJ" />
    </div>

    <p style="margin: 0 0 1.5mm; font-size: 7.2pt; font-weight: 600;">Die size (including scribe line): 2.21mm&times;1.56mm</p>

    <table class="technical-table" style="width: 100%; border-collapse: collapse; font-size: 6.2pt; line-height: 1.15; margin-bottom: 1.5mm;">
      <thead>
        <tr>
          <th style="width: 8%; text-align: center;">Pad No</th>
          <th style="width: 44%; text-align: left;">Name (Package)</th>
          <th colspan="2" style="width: 26%; text-align: center;">Pad centers coordinates (&mu;m)</th>
          <th style="width: 22%; text-align: center;">Pad Size (&mu;m&times;&mu;m)</th>
        </tr>
        <tr style="background: #f1f5f9; color: #64748b; font-size: 5.8pt;">
          <th></th>
          <th></th>
          <th style="text-align: center;">X</th>
          <th style="text-align: center;">Y</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="text-align: center;">1</td>
          <td>Flag (for VS-CW29151R-XX)<br/>NC (for VS-CW29150R-XX, VS-CW29150R-ADJ)</td>
          <td style="text-align: center;">160</td>
          <td style="text-align: center;">165</td>
          <td style="text-align: center;">200&times;200</td>
        </tr>
        <tr>
          <td style="text-align: center;">2</td>
          <td>Output (for VS-CW29150R-XX, VS-CW29151R-XX)<br/>Adjust (for VS-CW29150R-ADJ)</td>
          <td style="text-align: center;">160</td>
          <td style="text-align: center;">485</td>
          <td style="text-align: center;">200&times;200</td>
        </tr>
        <tr>
          <td style="text-align: center;">3</td>
          <td>Output</td>
          <td style="text-align: center;">165</td>
          <td style="text-align: center;">805</td>
          <td style="text-align: center;">200&times;200</td>
        </tr>
        <tr>
          <td style="text-align: center;">4</td>
          <td>Output</td>
          <td style="text-align: center;">165</td>
          <td style="text-align: center;">1230</td>
          <td style="text-align: center;">200&times;200</td>
        </tr>
        <tr>
          <td style="text-align: center;">5</td>
          <td>Input</td>
          <td style="text-align: center;">2045</td>
          <td style="text-align: center;">1230</td>
          <td style="text-align: center;">200&times;200</td>
        </tr>
        <tr>
          <td style="text-align: center;">6</td>
          <td>Input</td>
          <td style="text-align: center;">2045</td>
          <td style="text-align: center;">475</td>
          <td style="text-align: center;">200&times;200</td>
        </tr>
        <tr>
          <td style="text-align: center;">7</td>
          <td>Input (for VS-CW29150R-XX)<br/>Enable (for VS-CW29151R-XX, VS-CW29150R-ADJ) (Note 1)</td>
          <td style="text-align: center;">2045</td>
          <td style="text-align: center;">1310</td>
          <td style="text-align: center;">200&times;200</td>
        </tr>
        <tr>
          <td style="text-align: center;">8</td>
          <td>GND</td>
          <td style="text-align: center;">2045</td>
          <td style="text-align: center;">155</td>
          <td style="text-align: center;">200&times;200</td>
        </tr>
      </tbody>
    </table>

    <p style="margin: 0; font-size: 6.8pt; font-style: italic; color: #46505a;">
      Note 1. For both devices, VS-CW29150R-XX and VS-CW29151R-XX must be used the same chip &ldquo;VS-CW29150R-XX&rdquo;.
    </p>
    `
  };
  exportPages.push({ blocks: [page7Html], usedHeight: 240, locked: true, layoutMode: 'single-column' });

  // ==========================================
  // PAGE 8: SINGLE COLUMN (Bonding Diagrams)
  // ==========================================
  const page8Html: HtmlBlock = {
    kind: 'html',
    role: 'generic',
    fullWidth: true,
    estimatedHeight: 235,
    html: `
    <h2 style="text-align: center; margin-bottom: 1.5mm; font-size: 11pt;">BONDING DIAGRAM</h2>

    <h3 style="text-align: center; margin: 0 0 1mm; font-size: 8.5pt; color: #0D2B55;">VS-CW29150R-XX</h3>
    <div style="display: flex; justify-content: center; margin-bottom: 2mm;">
      <img src="${imgP8Bonding1}" style="max-height: 52mm; max-width: 90%; object-fit: contain;" alt="Bonding Diagram VS-CW29150R-XX" />
    </div>

    <h3 style="text-align: center; margin: 0 0 1mm; font-size: 8.5pt; color: #0D2B55;">VS-CW29150R-ADJ</h3>
    <div style="display: flex; justify-content: center; margin-bottom: 2mm;">
      <img src="${imgP8Bonding2}" style="max-height: 52mm; max-width: 90%; object-fit: contain;" alt="Bonding Diagram VS-CW29150R-ADJ" />
    </div>

    <h3 style="text-align: center; margin: 0 0 1mm; font-size: 8.5pt; color: #0D2B55;">VS-CW29151R-XX</h3>
    <div style="display: flex; justify-content: center; margin-bottom: 2.5mm;">
      <img src="${imgP8Bonding3}" style="max-height: 52mm; max-width: 90%; object-fit: contain;" alt="Bonding Diagram VS-CW29151R-XX" />
    </div>

    <p style="margin: 0; font-size: 7.4pt; font-weight: 600; color: #1e293b;">Package TO-220, TO-263</p>
    `
  };
  exportPages.push({ blocks: [page8Html], usedHeight: 235, locked: true, layoutMode: 'single-column' });

  // ==========================================
  // PAGE 9: SINGLE COLUMN (Assembly Characteristics & Additional Info)
  // ==========================================
  const page9Html: HtmlBlock = {
    kind: 'html',
    role: 'generic',
    fullWidth: true,
    estimatedHeight: 230,
    html: `
    <h2>ASSEMBLY CHARACTERISTICS</h2>
    <table class="technical-table" style="width: 100%; border-collapse: collapse; font-size: 6.8pt; line-height: 1.2; margin-bottom: 3.5mm;">
      <thead>
        <tr>
          <th style="width: 8%; text-align: center;">No.</th>
          <th style="width: 58%; text-align: left;">Assembly Characteristics</th>
          <th style="width: 34%; text-align: left;">Value</th>
        </tr>
      </thead>
      <tbody>
        <tr><td style="text-align: center;">1</td><td>Wafer Size</td><td>6 Inch</td></tr>
        <tr><td style="text-align: center;">2</td><td>Wafer Thickness before Grinding</td><td>675 +/-25 &mu;m</td></tr>
        <tr><td style="text-align: center;">3</td><td>Scribe Street Width</td><td>80 &mu;m</td></tr>
        <tr><td style="text-align: center;">4</td><td>Chip Size (including Scribe Line)</td><td>2.21&times;1.56 mm&sup2;</td></tr>
        <tr><td style="text-align: center;">5</td><td>Die Attach Material</td><td>Substrate is connected to GND</td></tr>
        <tr><td style="text-align: center;">6</td><td>Quantity of Bond Pad Metal Layers</td><td>2</td></tr>
        <tr><td style="text-align: center;">7</td><td>Pad Thickness</td><td>1.85 &mu;m</td></tr>
        <tr><td style="text-align: center;">8</td><td>Composition of Metal Layers</td><td>Al+Si(1.0%)+Ti(0.5%)</td></tr>
        <tr><td style="text-align: center;">9</td><td>Min. Bond Pad Opening Size</td><td>200&times;200 &mu;m</td></tr>
        <tr><td style="text-align: center;">10</td><td>Min. Bond Pad Pitch</td><td>320 &mu;m</td></tr>
        <tr><td style="text-align: center;">11</td><td>Min. Wire Diameters</td><td>1.2mil (30.5&mu;m)</td></tr>
        <tr><td style="text-align: center;">12</td><td>Circuit Under Pad Design (CUP)</td><td>Yes</td></tr>
      </tbody>
    </table>

    <h2>ADDITIONAL INFORMATION</h2>
    <p style="margin: 0 0 1mm; font-weight: 700; font-size: 7.2pt;">Pb-free products:</p>
    <ul style="margin: 0 0 2mm 3.8mm; padding-left: 3.2mm; font-size: 7pt; line-height: 1.3;">
      <li>RoHS compliant and compatible with the current requirements of IPC/JEDEC J-STD-020.</li>
    </ul>

    <p style="margin: 0 0 1mm; font-weight: 700; font-size: 7.2pt;">Green products:</p>
    <ul style="margin: 0 0 2mm 3.8mm; padding-left: 3.2mm; font-size: 7pt; line-height: 1.3;">
      <li>Lead-free (RoHS compliant)</li>
      <li>Halogen free (Br or Cl does not exceed 900ppm by weight in homogeneous material and total of Br and Cl does not exceed 1500ppm by weight).</li>
    </ul>

    <p style="margin: 0 0 1mm; font-weight: 700; font-size: 7.2pt;">Utilization:</p>
    <ul style="margin: 0 0 2.5mm 3.8mm; padding-left: 3.2mm; font-size: 7pt; line-height: 1.3;">
      <li>The management and disposal of these products shall be conducted in accordance with local legislative requirements and guidance.</li>
    </ul>

    <p style="margin: 0; font-size: 7.2pt; color: #334155;">The appearance complies with the requirements of the company standards.</p>
    `
  };
  exportPages.push({ blocks: [page9Html], usedHeight: 230, locked: true, layoutMode: 'single-column' });

  const pageModel: ExportPageModel = {
    title: '1.5A LOW-DROPOUT REGULATORS',
    productCode: 'VS-CW29150R-XX / VS-CW29150R-ADJ / VS-CW29151R-XX',
    logoSrc: logoBase64,
    pages: exportPages
  };

  console.log(`Generated pageModel with ${exportPages.length} pages.`);

  console.log('--- Rendering Document HTML ---');
  const html = renderExportDocumentHtml(pageModel, template, { mode: 'pdf' });
  const htmlPath = path.resolve('scratch', 'CW29150_cloned_9pages.html');
  fs.writeFileSync(htmlPath, html);
  console.log('Saved HTML to', htmlPath);

  console.log('--- Generating PDF via Puppeteer ---');
  const browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const browserPage = await browser.newPage();
  await browserPage.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 2 });
  await browserPage.setContent(html, { waitUntil: 'load' });
  await browserPage.waitForNetworkIdle({ idleTime: 300, timeout: 5000 }).catch(() => undefined);

  // Measure DOM metrics for every page
  const pageMetrics = await browserPage.evaluate(() => {
    const pages = Array.from(document.querySelectorAll('.pdf-page'));
    return pages.map((p, idx) => {
      const body = p.querySelector('.pdf-body') as HTMLElement;
      const clientH = body ? (body.clientHeight * 25.4) / 96 : 0;
      const scrollH = body ? (body.scrollHeight * 25.4) / 96 : 0;
      return {
        pageNumber: idx + 1,
        clientH: Number(clientH.toFixed(1)),
        scrollH: Number(scrollH.toFixed(1)),
        overflow: scrollH > clientH + 1.0
      };
    });
  });

  console.log('\n--- Page DOM Fit Metrics ---');
  pageMetrics.forEach(m => {
    console.log(`Page ${m.pageNumber}: clientHeight=${m.clientH}mm, scrollHeight=${m.scrollH}mm, overflow=${m.overflow}`);
  });

  // Take screenshot of each page
  const screenshotDir = path.resolve('scratch', 'rendered_pages');
  fs.mkdirSync(screenshotDir, { recursive: true });
  const pageElements = await browserPage.$$('.pdf-page');
  for (let i = 0; i < pageElements.length; i++) {
    const shotPath = path.join(screenshotDir, `page-${i + 1}.png`);
    await pageElements[i].screenshot({ path: shotPath });
  }
  console.log(`Captured ${pageElements.length} page screenshots.`);

  // Print PDF
  const pdfBuffer = await browserPage.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });

  await browser.close();

  const pdfPath = path.resolve('scratch', 'CW29150_cloned_9pages.pdf');
  fs.writeFileSync(pdfPath, pdfBuffer);
  console.log('Saved final PDF to', pdfPath);

  const doc = await PDFDocument.load(pdfBuffer);
  const finalCount = doc.getPageCount();
  console.log(`\n========================================`);
  console.log(`FINAL GENERATED PDF PAGE COUNT: ${finalCount}`);
  console.log(`========================================\n`);

  if (finalCount !== 9) {
    throw new Error(`Expected exactly 9 pages, got ${finalCount}`);
  }
}

main().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
