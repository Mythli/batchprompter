It is your job to style several pages which are integrated into the main page {{website_url}}.

The elements are embedded with javascript and become part of the sites HTML.

This is the booking form HTML:

```html
<!-- Root Integration Container -->
<div class="ws-element ws-singleintegration" data-ws-type="WSROOT" ...>
  <main class="ws-container ws-container-wsroot">
    <div class="websail form-0 singleintegration ws-light-theme">
      <form novalidate="">
        <div>
          <div class="ws-cart ws-wizard">
            
            <!-- 1. Step Navigation / Progress Bar -->
            <div class="ws-flex ws-flex-row">
              
              <!-- State A: Active Step -->
              <div class="ws-step-nav-group ws-flex ws-flex-row">
                <span class="ws-step-nav-group-title"></span>
                <button type="button" class="ws-button ws-button-fab ws-step-nav ws-step-nav-selected">
                  <span class="ws-button-icon ws-button-icon-left">1</span> 
                  <small class="ws-step-nav-title">SSS SSS | ...</small>
                </button>
              </div>

              <!-- State B: Inactive/Disabled Step -->
              <div class="ws-step-nav-group ws-flex ws-flex-row">
                <span class="ws-step-nav-group-title"></span>
                <button type="button" class="ws-button ws-button-fab ws-step-nav" disabled="">
                  <span class="ws-button-icon ws-button-icon-left">2</span> 
                  <small class="ws-step-nav-title">Rechnungsempfänger</small>
                </button>
              </div>
            </div>

            <!-- 2. Step Content Wrapper -->
            <div class="ws-step ws-flex ws-flex-row">
              <div class="ws-left-column ws-flex ws-flex-column">
                
                <!-- Main Form Fields -->
                <div>
                  <fieldset class="ws-fieldset ws-participant-group-flat">
                    <fieldset class="ws-fieldset">
                      
                      <!-- Input Variation: Email -->
                      <div class="ws-input-group ws-email-container">
                        <label class="ws-flex ws-flex-column">
                          <span class="ws-input-label ws-email-label">E-Mail<span>*</span></span>
                          <div>
                            <input class="ws-email ws-text-input ws-input" type="email" value="">
                          </div>
                        </label>
                      </div>

                      <!-- Input Variation: Select (Dropdown) -->
                      <div class="ws-input-group">
                        <label class="ws-flex ws-flex-column">
                          <span class="ws-input-label ws-select-label">Anrede<span>*</span></span>
                          <div>
                            <select class="ws-select ws-input" name="form_data.form_field.1.salutation_id">
                              <option value="">--- Bitte wählen ---</option>
                              <option value="1">Divers</option>
                            </select>
                            <svg class="ws-select-caret ws-svg ws-svg-arrow">...</svg>
                          </div>
                        </label>
                      </div>

                      <!-- Input Variation: Standard Text Input -->
                      <div class="ws-input-group ws-text-container">
                        <label class="ws-flex ws-flex-column">
                          <span class="ws-input-label ws-text-label">Vorname<span>*</span></span>
                          <div>
                            <input class="ws-text ws-text-input ws-input" type="text" value="">
                          </div>
                        </label>
                      </div>

                    </fieldset>
                  </fieldset>
                  
                  <!-- Hidden submit hook -->
                  <div><button type="submit"></button></div>
                </div>

                <!-- 3. Action Buttons (Back / Next) -->
                <div class="ws-form-buttons ws-flex ws-flex-row">
                  <button class="ws-button ws-button-clear ws-button-back" type="button"> 
                    <span class="ws-button-text"> « Zurück </span> 
                  </button>
                  <button class="ws-button ws-button-primary ws-button-submit" type="submit"> 
                    <span class="ws-button-text"> Weiter » </span> 
                  </button>
                </div>

                <!-- 4. Price Sidebar / Breakup -->
                <div class="ws-price-breakup ws-flex ws-flex-column">
                  
                  <div class="ws-flex ws-flex-row">
                    <h3>Preisvorschau</h3>
                  </div>
                  
                  <!-- Line Item -->
                  <dl class="ws-price-row ws-flex ws-flex-row">
                    <dt>
                        <span class="ws-price-title-cell">
                            <span class="course1 ws-course-last">SSS</span> 
                            <span class="title">SSS | Alle Module</span> 
                            <span class="fromToAuto">10.11.2025 - 22.02.2026</span>
                        </span>
                        <span class="ws-count-of-participants">× 1</span>
                    </dt>
                    <dd class="ws-price-line-total">700,00 €</dd>
                  </dl>

                  <!-- Total Sum -->
                  <dl class="ws-price-total ws-price-row ws-flex ws-flex-row">
                    <dt>
                        <span class="ws-price-title-cell">Summe</span>
                        <span class="ws-count-of-participants"></span>
                    </dt>
                    <dd class="ws-price-line-total">700,00 €</dd>
                  </dl>

                </div>

              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  </main>
</div>
```

This are examples on how you can style it (for different websites, completely different styles).

Example 1

```css
.websail {
    --ws-primary-color: #FF8400;
    --ws-primary-color-contrast: #fff;
    --ws-secondary-color: #a3007d;
   	--ws-secondary-color-contrast: #fff;
	
	--ws-button-bg: var(--ws-primary-color);
	--ws-button-text: var(--ws-primary-color-contrast);
	--ws-button-border-color: var(--ws-primary-color);
	
	--ws-button-hover-bg:#ff8a0f;;
	--ws-button-hover-text: var(--ws-primary-color-contrast);
	--ws-button-hover-border-color: var(--ws-button-border-color);

	--ws-link-color: var(--ws-primary-color); 
	--ws-link-hover-color: var(--ws-primary-color); 
	--ws-link-decoration: none;
	--ws-link-hover-decoration: underline;
	
	--ws-wizard-nav-selected-bg: var(--ws-primary-color); 
	
	--ws-input-bg: #fafafa; 
	--ws-input-border-color: #a9a9a9; 
	--ws-input-focus-border-color: var(--ws-primary-color);  
	--ws-input-margin: 0 0 var(--ws-gutter) 0;
    --ws-input-color: #212121VA;
	--ws-input-border-radius: 0;

    --ws-cart-preview-z-index: 1000;
    --ws-cart-preview-top: 85px;
   	--ws-coupon-code-padding: 5px;
}

.websail table,
.websail table thead th {
	border-bottom: 2px solid #ccc;
	margin-bottom: 10px;
}
.websail table tbody td {
	border-top: 1px solid #ddd;
}

/* ---------------------BUTTONS AND LINKS------------------------ */
.websail .ws-button {
    border-width: 2px;
    border-radius: 35px;
}

.websail .ws-button-primary {
    padding: 8px 20px;
	transition: color .3s ease 0ms, background-color .3s ease 0ms, border-radius .3s ease 0ms;
    box-shadow: 0 2px 0 0 #d66d00;
}

.websail a.ws-cell-link.ws-book-now-link {
	background-color: var(--ws-button-bg);
	color: var(--ws-button-text);
	padding: 5px 10px;
	border-radius: 35px;
}

.websail a.ws-cell-link.ws-book-now-link:hover {
	background-color: var(--ws-button-hover-bg);
	color: var(--ws-button-hover-text);
	text-decoration: none;
} 

/* ---------------------INPUTS------------------------ */
/* inputs, select, textarea */
.websail .ws-input, .websail .ws-select  {
	border-width: 1px;
    min-height: 38px;
    padding-left: 10px;
}

/* focus: input, textarea */
.websail .ws-input:not(.ws-select):focus, .websail .ws-textarea:focus {
    border-color: var(--ws-input-focus-border-color);
    box-shadow: 0 0 0 .5px var(--ws-input-focus-border-color);
}

/* checkbox and radio checked color */
.websail input.ws-checkbox:checked:not(:disabled),  .websail input.ws-radio:checked:not(:disabled) {
	filter: invert(100%) hue-rotate(180deg) brightness(1.4);
}

/* ---------------------SIGN IN------------------------ */
/* sign in with gap and box-shadow */
.websail .ws-signin-form.ws-flex-row {
    align-items: normal;
    gap: 20px;
}

.websail .ws-signin-form button {
    padding: 6px 24px
}

.websail .ws-signin-form input {
	border-style: solid;
    border-radius: 6px;
	outline: transparent;
}

.websail .ws-signin-form input:focus {
    box-shadow: 0 0 0 .5px var(--ws-primary-color);s
}

/* ---------------------COUPON------------------------ */
/* coupon styles */
/* coupon base styles */
.websail .coupon_code-container {
    margin-bottom: 0;
}
.websail .ws-coupon-code {
    align-items: normal;
    gap: 0;
}

/* coupon button */
.websail .ws-coupon-code-button, .websail .ws-coupon-code-button:hover {
    border-radius: 0;
    border-top-right-radius: 35px;
    border-bottom-right-radius: 35px;
	box-shadow: none;
}

/* coupon input */
.websail input[name="coupon_code"] {
	height: 100%;
    border-right-width: 0;
    border-top-left-radius: 35px;
    border-bottom-left-radius: 35px;
}

.websail input[name="coupon_code"]:focus {
	box-shadow: none !important;
    border-color: var(--ws-primary-color);
}

/* main container */
@media(max-width: 1000px) {
    .websail [component="ws-basic"][name="coupon-and-buttons"] {
        flex-direction: column;
    }
}

/* left container column direction instead of row */
.websail [name="coupon-and-buttons"] > div:first-child {
	flex-direction: column;
    align-items: start;
}

/* container: [message + input block], placing coupon message on top */
.websail [name="coupon-and-buttons"] h3 + div {
	flex-direction: column-reverse;
	align-items: start;
	text-align: center;
	width: 100%;
}

/* full width left container */
@media (max-width: 1000px) {
    .websail [name="coupon-and-buttons"] > div:first-child {
        width: 100%;
    }
}
/* full width message */
@media (max-width: 1000px) {
	.websail .ws-coupon-code + div {
	   width: 100%;
	}
}
/* full width input and button f*/
@media(max-width: 1000px) {
    .websail .ws-coupon-code.ws-flex.ws-flex-row {
        width: 100%;
    }
}

/* ---------------------COMMON------------------------ */
/* common styles */
/* extra prices margin */
.websail .ws-wizard .ws-input-group.extra-prices .ws-input-label + div {
    margin: 0 15px 0 0;
}

/* courses */
.websail .ws-cell.ws-booklink-cell {
    white-space: nowrap;
}

.websail .ws-cell.ws-description-cell p {
	color: #707070;
}

/* search border */ 
.websail .ws-text.ws-text-input.ws-search-select-query-input.unstyled {
	border-color: transparent;
}

/* ---------------------TABS AND BOOKINGS TABLE------------------------ */
/* tabs */
.websail .ws-tab.ws-tab-active {
    background: var(--ws-primary-color);
    color: var(--ws-primary-color-contrast);
}

.websail button.ws-tab {
	border-width: 1px;
}

/* bookings table */
.websail button.ws-appointment-list-toggle {
    width: 100%;
	font-weight: 500;
}

.websail button.ws-appointment-list-toggle:hover,  
.websail button.ws-appointment-list-toggle:focus {
    color: var(--ws-primary-color);
}

.websail .ws-bills-cell a {
    align-items: center
}
```

Now go ahead and style the booking form for the given website {{website_url}}.
Answer with CSS and nothing else. Only css which make the table, booking form and payment page look like they are really part of that website.

**EXAMPLE CSS:**
```css
.websail {
    --ws-primary-color: #333333;
}

.websail button.submit {
  border-radius: 8px;
  padding: 10px 20px;
}

.websail button.submit:hover {
  background-color: #0065ff;
} 
```




