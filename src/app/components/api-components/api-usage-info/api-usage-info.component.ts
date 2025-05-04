import {Component, Input} from '@angular/core';
import {CommonModule} from '@angular/common';
import {TranslateModule} from '@ngx-translate/core';

@Component({
	selector: 'app-api-usage-info',
	standalone: true,
	imports: [CommonModule, TranslateModule],
	templateUrl: './api-usage-info.component.html',
	styleUrl: './api-usage-info.component.scss'
})
export class ApiUsageInfoComponent {
	@Input() selectedApi: string = '';
	@Input() isLoadingUsage: boolean = false;
	@Input() isUpdatingUsage: boolean = false;
	@Input() usageError: string | null = null;
	@Input() characterCount: number = 0;
	@Input() characterLimit: number = 0;
	@Input() weeklyLimit: number = 0;
	@Input() dailyLimit: number = 0;
	@Input() fileCharLimit: number = 0;
	@Input() countdownValue: number = 0;
	@Input() countdownProgress: number = 0;
	@Input() retryCount: number = 0;
	@Input() MAX_RETRY_ATTEMPTS: number = 5;

	constructor() {
	}


}
