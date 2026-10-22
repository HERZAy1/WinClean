import { useState } from 'react'
import { Badge, Button, Card, Input, ProgressBar, Select, Switch } from '../components/ui'
import { zhCN } from '../i18n/zh-CN'

export function DevUiPage(): React.JSX.Element {
  const [privacyEnabled, setPrivacyEnabled] = useState(true)

  return (
    <section className="page dev-ui">
      <header className="page__header">
        <span className="eyebrow">{zhCN.pages.devUi.eyebrow}</span>
        <h2 className="page__title">{zhCN.pages.devUi.title}</h2>
        <p className="page__description">{zhCN.pages.devUi.description}</p>
      </header>

      <div className="dev-ui__grid">
        <Card heading={zhCN.devUi.buttons}>
          <div className="dev-ui__row">
            <Button variant="primary">{zhCN.devUi.buttonPrimary}</Button>
            <Button variant="secondary">{zhCN.devUi.buttonSecondary}</Button>
            <Button variant="ghost">{zhCN.devUi.buttonGhost}</Button>
            <Button variant="danger">{zhCN.devUi.buttonDanger}</Button>
            <Button disabled>{zhCN.devUi.buttonDisabled}</Button>
          </div>
        </Card>

        <Card heading={zhCN.devUi.badges}>
          <div className="dev-ui__row">
            <Badge tone="neutral">{zhCN.devUi.badgeNeutral}</Badge>
            <Badge tone="accent">{zhCN.devUi.badgeAccent}</Badge>
            <Badge tone="success">{zhCN.devUi.badgeSuccess}</Badge>
            <Badge tone="warning">{zhCN.devUi.badgeWarning}</Badge>
            <Badge tone="danger">{zhCN.devUi.badgeDanger}</Badge>
          </div>
        </Card>

        <Card heading={zhCN.devUi.progress}>
          <div className="dev-ui__stack">
            <ProgressBar
              label={zhCN.devUi.progressDeterminate}
              value={68}
              showValue
            />
            <ProgressBar
              label={zhCN.devUi.progressIndeterminate}
              indeterminate
            />
          </div>
        </Card>

        <Card heading={zhCN.devUi.form}>
          <div className="dev-ui__form">
            <Input
              label={zhCN.devUi.inputLabel}
              placeholder={zhCN.devUi.inputPlaceholder}
              hint={zhCN.devUi.inputHint}
            />
            <Select
              label={zhCN.devUi.selectLabel}
              defaultValue="recycle"
            >
              <option value="recycle">{zhCN.devUi.selectRecycle}</option>
              <option value="permanent">{zhCN.devUi.selectPermanent}</option>
            </Select>
            <Switch
              checked={privacyEnabled}
              onCheckedChange={setPrivacyEnabled}
              label={zhCN.devUi.switchLabel}
              description={zhCN.devUi.switchDescription}
            />
          </div>
        </Card>

        <Card
          className="dev-ui__card-preview"
          heading={zhCN.devUi.cardTitle}
          description={zhCN.devUi.cardDescription}
          actions={
            <Button
              variant="secondary"
              size="sm"
            >
              {zhCN.devUi.cardAction}
            </Button>
          }
        >
          <div className="dev-ui__card-body">
            <Badge tone="accent">{zhCN.devUi.badgeAccent}</Badge>
            <ProgressBar
              value={42}
              label={zhCN.devUi.progressDeterminate}
              showValue
            />
          </div>
        </Card>
      </div>
    </section>
  )
}
